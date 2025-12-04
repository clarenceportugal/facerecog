// Centralized API configuration
import axios from 'axios';

// Get API base URL from environment variable (Vite uses VITE_ prefix)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Create an axios instance with default base URL
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;

