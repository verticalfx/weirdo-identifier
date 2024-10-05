const { NlpManager } = require("node-nlp");
const stringSimilarity = require("string-similarity");
const fs = require("fs");
const natural = require("natural");
const unhomoglyph = require("unhomoglyph");

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
const evaluateUsername = (username) => {
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

  return riskScore;
};

// Main execution function
(async () => {
  const usernames = readUsernamesFromFile("./usernames.txt");

  usernames.forEach((username) => {
    const riskScore = evaluateUsername(username);
    console.log(`Username: ${username}, Risk Score: ${riskScore}`);
  });
})();
