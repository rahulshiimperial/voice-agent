const express = require('express');
const axios = require('axios');
const router = express.Router();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Text-to-speech using system commands (macOS)
async function textToSpeech(text) {
  return new Promise((resolve, reject) => {
    const outputFile = path.join(__dirname, 'temp_voice.mp3');
    const command = `say -v Samantha -o ${outputFile} --data-format=mp3 "${text}"`;
    
    exec(command, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(outputFile);
      }
    });
  });
}

// Speech-to-text using Whisper API
async function speechToText(audioPath) {
  try {
    const audioFile = fs.createReadStream(audioPath);
    const response = await openai.createTranscription(
      audioFile,
      "whisper-1"
    );
    return response.data.text;
  } catch (error) {
    console.error('Speech recognition error:', error);
    return null;
  }
}

// Voice endpoint
router.post('/voice-command', async (req, res) => {
  try {
    if (!req.files || !req.files.audio) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioFile = req.files.audio;
    const tempPath = path.join(__dirname, 'temp_audio.webm');
    
    await audioFile.mv(tempPath);
    const command = await speechToText(tempPath);
    
    if (!command) {
      return res.json({ response: "Sorry, I didn't catch that. Could you repeat?" });
    }

    // Process with weather endpoint
    const weatherResponse = await axios.post('http://localhost:3000/api/weather-voice', {
      command
    });

    // Convert response to speech
    const speechFile = await textToSpeech(weatherResponse.data.response);
    
    res.sendFile(speechFile, () => {
      // Clean up temp files
      fs.unlinkSync(tempPath);
      fs.unlinkSync(speechFile);
    });

  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({ error: 'Voice processing failed' });
  }
});

module.exports = router;