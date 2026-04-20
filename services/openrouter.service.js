import {
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_APP_NAME,
  OPENROUTER_APP_URL,
  hasOpenRouterConfig
} from '../config/openrouter.js';

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const cleanJsonResponse = (text) => {
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  }
  return trimmed;
};

export const getFallbackAnalysis = ({ questionId, topicName, code }) => {
  const lowerCode = String(code || '').toLowerCase();
  const mistakes = [];

  if (!/for\s*\(|while\s*\(/.test(lowerCode)) {
    mistakes.push({ title: 'No visible iteration logic', detail: 'Code me traversal ya loop pattern clearly visible nahi hai.', severity: 'medium', type: 'logic' });
  }
  if (/scanner|system\.out/.test(lowerCode)) {
    mistakes.push({ title: 'Platform mismatch', detail: 'LeetCode style solutions me usually full input/output handling nahi likhte.', severity: 'low', type: 'platform' });
  }
  if (/==\s*null/.test(lowerCode) === false && /linkedlist|node/i.test(topicName || '')) {
    mistakes.push({ title: 'Null edge case missing', detail: 'Linked structure based topics me null handling check zaroor karo.', severity: 'medium', type: 'edge-case' });
  }

  if (!mistakes.length) {
    mistakes.push({ title: 'Need deeper AI review', detail: 'Fallback analyzer ko strong bug pattern nahi mila. AI mode me better review milega.', severity: 'low', type: 'general' });
  }

  return {
    summary: `Fallback review generated for question ${questionId || 'custom-problem'}. OpenRouter key add karne par deeper AI analysis milega.`,
    detected_topic: topicName || 'Array',
    detected_subtopic: 'Core Pattern',
    mistakes,
    corrected_code: code,
    improvement_tips: [
      'Dry run with 2-3 small test cases before submit.',
      'Edge cases likh kar manually verify karo.',
      'Time complexity aur boundary conditions alag se check karo.'
    ],
    next_questions: [],
    confidence_score: 0.45,
    source_mode: 'fallback'
  };
};

export const analyzeWithOpenRouter = async ({ questionId, topicName, language, code, currentLevel, weakTopic, recentMistakes }) => {
  if (!hasOpenRouterConfig()) {
    return getFallbackAnalysis({ questionId, topicName, code });
  }

  const prompt = `You are an expert DSA mentor. Analyze the student's code and return ONLY valid JSON.

Return JSON with this exact shape:
{
  "summary": "...",
  "detected_topic": "...",
  "detected_subtopic": "...",
  "mistakes": [
    {
      "title": "...",
      "detail": "...",
      "severity": "low|medium|high",
      "type": "logic|syntax|edge-case|complexity|pattern|platform"
    }
  ],
  "corrected_code": "...",
  "improvement_tips": ["...", "..."],
  "next_questions": [
    {
      "title": "...",
      "difficulty": "easy|medium|hard",
      "reason": "..."
    }
  ],
  "confidence_score": 0.0
}

Student context:
- level: ${currentLevel || 'Beginner'}
- current weak topic: ${weakTopic || 'Unknown'}
- recent mistakes: ${recentMistakes?.join(' | ') || 'None'}

Problem context:
- platform problem id: ${questionId || 'custom'}
- topic: ${topicName || 'Unknown'}
- language: ${language || 'Java'}

Code:
${code}`;

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': OPENROUTER_APP_URL,
      'X-Title': OPENROUTER_APP_NAME
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Return only JSON. No markdown.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const raw = await response.json();

  if (!response.ok) {
    const message = raw?.error?.message || 'OpenRouter request failed';
    throw new Error(message);
  }

  const content = raw?.choices?.[0]?.message?.content || '';
  const parsed = safeJsonParse(cleanJsonResponse(content));

  if (!parsed) {
    throw new Error('OpenRouter response parse failed.');
  }

  return {
    summary: parsed.summary || 'AI analysis completed.',
    detected_topic: parsed.detected_topic || topicName || 'Array',
    detected_subtopic: parsed.detected_subtopic || 'General Pattern',
    mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
    corrected_code: parsed.corrected_code || code,
    improvement_tips: Array.isArray(parsed.improvement_tips) ? parsed.improvement_tips : [],
    next_questions: Array.isArray(parsed.next_questions) ? parsed.next_questions : [],
    confidence_score: Number(parsed.confidence_score || 0.7),
    source_mode: 'openrouter'
  };
};
