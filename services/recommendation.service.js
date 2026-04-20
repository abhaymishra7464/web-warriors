import { getFollowupQuestions, getQuestionsForTopic, normalizeTopicName } from './question-bank.service.js';

export const buildSmartSuggestions = ({
  currentLevel = 'Beginner',
  weakTopic = 'Array',
  recentMistakes = [],
  currentPlanTasks = [],
  lastQuestionId = ''
}) => {
  const topMistake = recentMistakes[0] || null;
  const targetTopic = normalizeTopicName(topMistake?.topic_name || weakTopic || currentPlanTasks[0]?.topic_name || 'Array');

  const nextQuestions = getFollowupQuestions({
    topic: targetTopic,
    level: currentLevel,
    solvedQuestionId: lastQuestionId,
    mistakeTitle: topMistake?.mistake_title || '',
    limit: 6
  });

  const revisionQuestions = getQuestionsForTopic(targetTopic, currentLevel, 4);

  const actionCards = [
    {
      title: `Focus on ${targetTopic}`,
      text: topMistake
        ? `Recent mistake pattern: ${topMistake.mistake_title}. Pehle same logic ke easy questions revise karo.`
        : `${targetTopic} abhi tumhare current flow ka best next topic lag raha hai.`
    },
    {
      title: 'Today action',
      text: currentPlanTasks.length
        ? `Day ${currentPlanTasks[0].day_number} se start karo: ${currentPlanTasks[0].task_title}`
        : 'Planner create karke day-wise task sequence unlock karo.'
    },
    {
      title: 'Improvement loop',
      text: 'Question solve karo → analyzer me code daalo → similar easy followup solve karo → note save karo.'
    }
  ];

  return {
    targetTopic,
    nextQuestions,
    revisionQuestions,
    actionCards
  };
};

export const buildReminderPayloads = ({ recentMistakes = [], weakTopic = 'Array', profileId = null, userId }) => {
  const items = [];
  const topMistake = recentMistakes[0];

  if (topMistake) {
    items.push({
      user_id: userId,
      profile_id: profileId,
      reminder_type: 'mistake-review',
      title: `Review ${topMistake.topic_name || weakTopic}`,
      message: `Repeated issue: ${topMistake.mistake_title}. Ek aur similar question solve karo aur note revise karo.`,
      due_at: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
      status: 'pending'
    });
  }

  if (!items.length) {
    items.push({
      user_id: userId,
      profile_id: profileId,
      reminder_type: 'practice',
      title: `Practice ${weakTopic}`,
      message: `${weakTopic} ko aaj ke focus topic ke roop me revise karo.`,
      due_at: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
      status: 'pending'
    });
  }

  return items;
};
