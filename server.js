require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const fileUpload = require('express-fileupload');
const fs = require('fs'); // Standard fs for createReadStream
const fsPromises = require('fs').promises; // fs.promises for async operations
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Weather API function
async function getWeather(location) {
  try {
    const response = await axios.get(
      `http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${location}`
    );
    return {
      temp: response.data.current.temp_c,
      condition: response.data.current.condition.text,
      location: response.data.location.name
    };
  } catch (error) {
    throw new Error(`Weather API error: ${error.message}`);
  }
}

// Voice endpoint
app.post('/voice-command', async (req, res) => {
  try {
    if (!req.files?.audio) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioFile = req.files.audio;
    // Validate file size and type
    if (audioFile.size === 0) {
      return res.status(400).json({ error: 'Empty audio file' });
    }
    if (!audioFile.mimetype.includes('audio')) {
      return res.status(400).json({ error: 'Invalid file type, audio required' });
    }

    // Create a temporary file path
    const tempFilePath = path.join(__dirname, 'temp_audio.webm');
    await audioFile.mv(tempFilePath);

    // Verify file exists and is readable
    await fsPromises.access(tempFilePath);

    // Create a readable stream from the file
    const audioStream = fs.createReadStream(tempFilePath);

    // Send to Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "whisper-1",
      response_format: "text"
    });

    // Clean up temp file
    await fsPromises.unlink(tempFilePath).catch(err => console.error('Error deleting temp file:', err));

    // Check if the query is weather-related
    const isWeatherQuery = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: `Is the following query related to weather? "${transcription}" Respond with "yes" or "no".`
      }],
      max_tokens: 10
    });

    const isWeatherRelated = isWeatherQuery.choices[0].message.content.trim().toLowerCase() === "yes";

    if (!isWeatherRelated) {
      const answer = "Sorry, I can only help with weather-related questions.";
      return res.json({ 
        text: answer,
        location: null,
        temperature: null
      });
    }

    // Get location from transcription
    const locationResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: `Extract just the location name from: "${transcription}"`
      }]
    });

    const location = locationResponse.choices[0].message.content.trim();
    if (!location) {
      return res.status(400).json({ error: 'No location found in transcription' });
    }

    const weather = await getWeather(location);

    // Generate response
    const answer = `It's ${weather.temp}°C with ${weather.condition} in ${weather.location}`;
    
    res.json({ 
      text: answer,
      location: weather.location,
      temperature: weather.temp
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Something went wrong' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});