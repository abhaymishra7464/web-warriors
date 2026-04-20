import dotenv from 'dotenv';

dotenv.config();

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';
export const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
export const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'Codiqo';
export const OPENROUTER_APP_URL = process.env.APP_URL || 'http://localhost:3000';

export const hasOpenRouterConfig = () => Boolean(OPENROUTER_API_KEY);
