import React, { useState } from 'react';
import styled from 'styled-components';
import Fuse from 'fuse.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import data from '../data/data.json';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY); // Read API key from .env
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Initialize Fuse.js for fuzzy searching
const fuse = new Fuse(data.questions, {
  keys: ['question'], // Search only in the 'question' field
  includeScore: true, // Include a match score
  threshold: 0.3, // Lower threshold means stricter matching
});

const ChatbotContainer = styled.div`
  position: fixed;
  top: 50%;
  right: 20px;
  transform: translateY(-50%); /* Center vertically */
  width: 350px; /* Increased width */
  height: 500px; /* Increased height */
  background-color: #f1f1f1;
  border: 1px solid #ccc;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
`;

const ChatHeader = styled.div`
  padding: 10px;
  background-color: #007bff;
  color: white;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: white;
  font-size: 16px; /* Smaller size */
  cursor: pointer;
  padding: 5px;
`;

const ChatBody = styled.div`
  flex: 1;
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px; /* Spacing between messages */
`;

const Message = styled.div`
  max-width: 80%;
  padding: 10px;
  border-radius: 10px;
  word-wrap: break-word;
  font-size: 14px;

  &.user {
    align-self: flex-end; /* Sender message on the right */
    background-color: #007bff;
    color: white;
  }

  &.bot {
    align-self: flex-start; /* Receiver message on the left */
    background-color: #e1e1e1;
    color: black;
  }
`;

const ChatInput = styled.div`
  display: flex;
  padding: 10px;
  border-top: 1px solid #ccc;
`;

const InputField = styled.input`
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 14px;
`;

const SendButton = styled.button`
  margin-left: 10px;
  padding: 8px 12px; /* Smaller size */
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
`;

function Chatbot({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');

  // Function to call Gemini API
  const fetchGeminiResponse = async (query) => {
    try {
      const result = await model.generateContent(query);
      return result.response.text(); // Return the generated text
    } catch (error) {
      console.error('Error fetching Gemini response:', error);
      return "Sorry, I couldn't fetch a response.";
    }
  };

  const handleSendMessage = async () => {
    if (userInput.trim() === '') return;

    // Add user message to chat
    const userMessage = { text: userInput, sender: 'user' };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    // Find the closest matching question using Fuse.js
    const searchResult = fuse.search(userInput);

    let botMessage;
    if (searchResult.length > 0) {
      // If a match is found in JSON, use the corresponding answer
      botMessage = {
        text: searchResult[0].item.answer,
        sender: 'bot',
      };
    } else {
      // If no match is found, call the Gemini API
      const geminiResponse = await fetchGeminiResponse(userInput);
      botMessage = {
        text: geminiResponse,
        sender: 'bot',
      };
    }

    // Add bot message to chat
    setMessages((prevMessages) => [...prevMessages, botMessage]);

    // Clear input
    setUserInput('');
  };

  return (
    <ChatbotContainer>
      <ChatHeader>
        <span>Chatbot</span>
        <CloseButton onClick={onClose}>×</CloseButton>
      </ChatHeader>
      <ChatBody>
        {messages.map((msg, index) => (
          <Message key={index} className={msg.sender}>
            {msg.text}
          </Message>
        ))}
      </ChatBody>
      <ChatInput>
        <InputField
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type a message..."
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <SendButton onClick={handleSendMessage}>Send</SendButton>
      </ChatInput>
    </ChatbotContainer>
  );
}

export default Chatbot;
