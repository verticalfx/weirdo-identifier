const { NlpManager } = require("node-nlp");
const stringSimilarity = require("string-similarity");
const fs = require("fs");
const natural = require("natural");
const unhomoglyph = require("unhomoglyph");
const readline = require("readline");

const manager = new NlpManager({ languages: ['en'] });
manager.load('./model.nlp');

const tokenizer = new natural.WordTokenizer();

// Load inappropriate terms from JSON
const inappropriateTerms = JSON.parse(fs.readFileSync("./terms.json", "utf8"));

// Function to read usernames from a text file
const readUsernamesFromFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return data.split(/\r?\n/).filter(Boolean); // Remove empty lines
  } catch (err) {
    console.error(`Error reading file from disk: ${err}`);
    return [];
  }
};

// Normalize usernames for consistent comparison
const normalizeUsername = (username) => {
  let normalized = unhomoglyph(username.toLowerCase());
  return normalized
    .replace(/([a-z])\1+/g, "$1") // Remove repeated letters
    .replace(/[^\w\s]|_/g, "")     // Remove non-alphanumeric characters
    .replace(/[0ø°©]/g, "o")
    .replace(/[1!|iïįìíîïĩįı]/g, "i")
    .replace(/[3€]/g, "e")
    .replace(/[4@^äæãåā]/g, "a")
    .replace(/[5\$§]/g, "s")
    .replace(/[7+]/g, "t")
    .replace(/[8]/g, "b")
    .replace(/[9]/g, "g")
    .replace(/[\(\[]/g, "c")
    .replace(/[\)\]]/g, "d")
    .replace(/[¥ÿ]/g, "y")
    .replace(/[2]/g, "z")
    .replace(/[üùúûũū]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/[ñ]/g, "n");
};

// Function to split concatenated words in the username
const splitUsername = (username) => tokenizer.tokenize(username);

// Function to compute fuzzy similarity score
const calculateFuzzyMatchScore = (username, term) =>
  stringSimilarity.compareTwoStrings(username, term);

// Function to score the username based on inappropriate terms and flags
const evaluateUsername = async (username) => {
  let riskScore = 0;
  const normalizedUsername = normalizeUsername(username);

  inappropriateTerms.forEach(({ term, weight }) => {
    const normalizedTerm = normalizeUsername(term);
    const similarityScore = calculateFuzzyMatchScore(normalizedUsername, normalizedTerm);

    if (normalizedUsername.includes(normalizedTerm)) {
      riskScore += weight;
    } else if (similarityScore > 0.6) {
      riskScore += Math.floor(similarityScore * weight);
    }
  });

  // Special case: Check if username contains both '6' and '9'
  if (normalizedUsername.includes("6") && normalizedUsername.includes("9")) {
    riskScore += 15;
  }

  // Split username and check for inappropriate terms
  splitUsername(normalizedUsername).forEach((word) => {
    inappropriateTerms.forEach(({ term, weight }) => {
      if (word === term) {
        riskScore += weight;
      }
    });
  });

  const response = await manager.process('en', normalizedUsername);
  if (response.intent === 'username.inappropriate' && response.score > 0.5) {
    riskScore += 20; 
  }

  return { riskScore, normalizedUsername };
};

// Set to keep track of usernames added to training data
const addedUsernames = new Set();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to prompt the user
const promptUser = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
};

(async () => {
  console.log("Reading usernames from file...");
  const usernames = readUsernamesFromFile("./usernames.txt");
  console.log(`Read ${usernames.length} usernames from file`);

  console.log("Processing usernames...");

  for (const username of usernames) {
    const { riskScore, normalizedUsername } = await evaluateUsername(username);

    console.log(`Username: ${username}, Risk Score: ${riskScore}`);

    // If risk score is above threshold, prompt the user
    if (riskScore > 15) {
      const userResponse = await promptUser(`Do you think the username "${username}" is inappropriate? (y/n): `);
      if (userResponse === 'y' || userResponse === 'yes') {
        if (!addedUsernames.has(normalizedUsername)) {
          manager.addDocument('en', normalizedUsername, 'username.inappropriate');
          addedUsernames.add(normalizedUsername);
          console.log(`Added "${normalizedUsername}" to training data.`);
        } else {
          console.log(`"${normalizedUsername}" is already in training data.`);
        }
      } else {
        console.log(`Skipped adding "${normalizedUsername}" to training data.`);
      }
    }
  }

  console.log("Retraining the model...");
  await manager.train();
  manager.save('./model.nlp');
  console.log("Model retrained and saved.");

  rl.close();

  console.log("Done!");
})();
