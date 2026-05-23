import axios from 'axios';

// In production, this would be your hosted API URL
const API_BASE_URL = process.env.MARKETPLACE_API_URL || 'http://localhost:3000/api';

export async function fetchComponentMetadata(slug) {
  try {
    const response = await axios.get(`${API_BASE_URL}/components/${slug}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Component "${slug}" not found in the marketplace.`);
    }
    throw new Error(`Failed to fetch metadata: ${error.message}`);
  }
}
