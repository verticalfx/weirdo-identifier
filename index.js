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

// Initialize in-memory maps for re-evaluation counts
const safeUsernameFlaggedCounts = new Map();

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

// Function to check if a username is already in training data
const isUsernameInTrainingData = (normalizedUsername, intent) => {
  const exists = manager.nlp.nluManager.domainManagers.en.sentences.some(
    (sentence) => sentence.utterance === normalizedUsername && sentence.intent === intent
  );
  return exists;
};

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
  return { riskScore, normalizedUsername, response };
};

// Create a readline interface for user input
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

// Arrays of acceptable affirmative and negative responses
const affirmativeResponses = ['y', 'yes', 'yeah', 'yea', 'yep', 'sure', 'ok'];
const negativeResponses = ['n', 'no', 'nope', 'nah'];

// Main execution function
(async () => {
  console.log("Reading usernames from file...");
  const usernames = readUsernamesFromFile("./usernames.txt");
  console.log(`Read ${usernames.length} usernames from file`);

  console.log("Processing usernames...");

  for (const username of usernames) {
    const { riskScore, normalizedUsername, response } = await evaluateUsername(username);

    // Check if username is in training data as 'username.safe' or 'username.inappropriate'
    const isSafe = isUsernameInTrainingData(normalizedUsername, 'username.safe');
    const isInappropriate = isUsernameInTrainingData(normalizedUsername, 'username.inappropriate');

    // If username is already classified, skip further processing
    if (isSafe) {
      console.log(`Username: ${username} is marked as safe in the model. Skipping.`);
      continue;
    }
    if (isInappropriate) {
      console.log(`Username: ${username} is marked as inappropriate in the model. Skipping.`);
      continue;
    }

    // If the model predicts the username as safe with high confidence, skip prompting
    if (response.intent === 'username.safe' && response.score > 0.8) {
      console.log(`Username: ${username} is predicted as safe by the model. Skipping.`);
      continue;
    }

    // If the model predicts the username as inappropriate with high confidence, skip prompting
    if (response.intent === 'username.inappropriate' && response.score > 0.8) {
      console.log(`Username: ${username} is predicted as inappropriate by the model.`);
      // Optionally, you can act on this prediction (e.g. flag the username)
      continue;
    }

    console.log(`Username: ${username}, Risk Score: ${riskScore}`);

    // Check for similarity with safe usernames if risk score is high
    if (riskScore > 15) {
      // Get all safe usernames from the training data
      const safeUsernames = manager.nlp.nluManager.domainManagers.en.sentences
        .filter((sentence) => sentence.intent === 'username.safe')
        .map((sentence) => sentence.utterance);

      for (const safeUsername of safeUsernames) {
        const similarity = stringSimilarity.compareTwoStrings(normalizedUsername, safeUsername);
        if (similarity > 0.8) {
          const count = parseInt(safeUsernameFlaggedCounts.get(safeUsername) || '0', 10);
          safeUsernameFlaggedCounts.set(safeUsername, (count + 1).toString());

          // If count exceeds threshold, remove from safe usernames
          if (count + 1 >= 5) {
            // Remove the safe username from the training data
            manager.removeDocument('en', safeUsername, 'username.safe');
            safeUsernameFlaggedCounts.delete(safeUsername);
            console.log(`Safe username "${safeUsername}" has been flagged multiple times. Re-evaluating.`);
          }
        }
      }
    }

    // If risk score is above threshold, prompt the user
    if (riskScore > 15) {
      let isValidInput = false;
      let userResponse;

      while (!isValidInput) {
        userResponse = await promptUser(`Do you think the username "${username}" is inappropriate? (y/n): `);
        if (affirmativeResponses.includes(userResponse)) {
          isValidInput = true;
          // Add to 'username.inappropriate' intent
          manager.addDocument('en', normalizedUsername, 'username.inappropriate');
          console.log(`Added "${normalizedUsername}" to 'username.inappropriate' in training data.`);
        } else if (negativeResponses.includes(userResponse)) {
          isValidInput = true;
          // Add to 'username.safe' intent
          manager.addDocument('en', normalizedUsername, 'username.safe');
          console.log(`Added "${normalizedUsername}" to 'username.safe' in training data.`);
          // Reset flagged count
          safeUsernameFlaggedCounts.set(normalizedUsername, '0');
        } else {
          console.log("Invalid input. Please enter 'y' for yes or 'n' for no.");
        }
      }
    }
  }

  console.log("Retraining the model...");
  await manager.train();
  manager.save('./model.nlp');
  console.log("Model retrained and saved.");

  // Close the readline interface
  rl.close();

  console.log("Done!");
})();
