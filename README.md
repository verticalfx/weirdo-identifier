
# Weirdo Identifier

This is a mini project inspired by @rubensim's method for predicting users linked to ERP (erotic roleplay). The project uses machine learning to flag inappropriate usernames based on a dataset of terms and a list of usernames.

## How to Use

### Requirements
1. Download and install Node.js from [here](https://nodejs.org/).
2. Clone this repository:
   ```
   git clone https://github.com/verticalfx/weirdo-identifier.git
   ```
3. Navigate to the project directory:
   ```
   cd weirdo-identifier
   ```
4. Install the dependencies:
   ```
   npm install
   ```

### Input
To test the tool, create or update a `usernames.txt` file with a list of usernames, one per line. These will be evaluated based on the predefined terms.

### Running the Project
After setting up, run the project using the following command:
```
node index.js
```

The script will evaluate each username from the `usernames.txt` file and flag them based on a risk score calculated from the provided dataset of inappropriate terms. You will be prompted to validate any flagged usernames and can classify them as 'safe' or 'inappropriate'.

### Output
- The tool will automatically update the ML model based on your input.
- Results will be printed in the console, and the model will be saved to `model.nlp` for future use.

### Re-training the Model
After each run, the model is re-trained using the new inputs you provide.

## File Structure
- `index.js`: Main script that processes usernames and applies the machine learning model.
- `model.nlp`: Trained natural language processing model.
- `terms.json`: List of inappropriate terms used to flag usernames.
- `usernames.txt`: Input file containing usernames to evaluate.
- `safe_usernames.json`: Stored list of safe usernames.
- `processed_usernames.json`: Stored results of processed usernames.

