import supabase from '../config/supabase.js';
import { analyzeWithOpenRouter } from '../services/openrouter.service.js';
import { buildReminderPayloads, buildSmartSuggestions } from '../services/recommendation.service.js';
import { getQuestionsForTopic, normalizeTopicName } from '../services/question-bank.service.js';

const ANALYZER_CSS = '/css/dashboard.css';

const buildSuccessLearningNotes = (aiResult, questionId) => {
  const concepts = aiResult.concepts_cleared || [];
  const suggestions = aiResult.next_questions || [];
  const lines = [
    `Question: ${questionId}`,
    `Topic: ${normalizeTopicName(aiResult.detected_topic || 'Array')}`,
    '',
    'What you learned:',
    aiResult.summary || 'Solution looks correct and core logic is working well.',
    '',
    'Concepts that became clearer:',
    ...(concepts.length ? concepts.map((item, index) => `${index + 1}. ${item}`) : ['1. Core approach and implementation logic improved.']),
    '',
    'Next similar LeetCode questions:',
    ...(suggestions.length ? suggestions.map((item, index) => `${index + 1}. ${item}`) : ['1. Practice a similar problem from the same topic.'])
  ];

  return lines.join('\n');
};

const buildMistakeLearningNotes = (aiResult, questionId) => {
  const lines = [
    `Question: ${questionId}`,
    `Topic: ${normalizeTopicName(aiResult.detected_topic || 'Array')}`,
    '',
    'What went wrong:',
    ...(aiResult.mistakes?.length
      ? aiResult.mistakes.map((item, index) => `${index + 1}. ${item.title} - ${item.detail}`)
      : ['1. Logic needs revision.']),
    '',
    'How to improve:',
    ...(aiResult.improvement_tips?.length
      ? aiResult.improvement_tips.map((item, index) => `${index + 1}. ${item}`)
      : ['1. Re-read the approach and retry the question.']),
    '',
    'Suggested next questions:',
    ...((aiResult.next_questions || []).length
      ? aiResult.next_questions.map((item, index) => `${index + 1}. ${item}`)
      : ['1. Solve one easier similar question from the same topic.'])
  ];

  return lines.join('\n');
};

const renderAnalyzerView = (res, payload = {}, status = 200) => {
  return res.status(status).render('analyzer/index', {
    pageTitle: 'AI Analyzer',
    pageCss: ANALYZER_CSS,
    formData: {
      platform: 'LeetCode',
      questionId: '',
      language: 'Java',
      code: '',
      ...payload.formData
    },
    result: null,
    error: null,
    starterQuestions: [],
    ...payload
  });
};

export const renderAnalyzer = async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('dsa_profiles')
      .select('id, profile_name, language, current_level, start_topic_slug')
      .eq('user_id', req.session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const starterTopic = normalizeTopicName(profile?.start_topic_slug || 'Array');
    const starterQuestions = getQuestionsForTopic(starterTopic, profile?.current_level || 'Beginner', 6);

    return renderAnalyzerView(res, {
      formData: {
        language: profile?.language || 'Java'
      },
      starterQuestions
    });
  } catch (error) {
    console.error('renderAnalyzer error:', error.message);
    return renderAnalyzerView(res, {
      error: error.message || 'Failed to load analyzer.',
      starterQuestions: []
    }, 500);
  }
};

export const submitAnalyzer = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { platform, questionId, language, code } = req.body;

    const formData = {
      platform: platform || 'LeetCode',
      questionId,
      language,
      code
    };

    if (!questionId?.trim() || !code?.trim() || !language?.trim()) {
      return renderAnalyzerView(res, {
        error: 'Question id, language and code are required.',
        formData,
        starterQuestions: []
      }, 400);
    }

    const { data: profile } = await supabase
      .from('dsa_profiles')
      .select('id, profile_name, current_level, start_topic_slug')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: activePlan } = await supabase
      .from('study_plans')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: recentMistakes } = await supabase
      .from('mistake_logs')
      .select('mistake_title, topic_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: analytics } = await supabase
      .from('user_analytics')
      .select('weak_topic')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const guessedTopic = normalizeTopicName(
      analytics?.weak_topic || profile?.start_topic_slug || 'Array'
    );

    const { data: submission, error: submissionError } = await supabase
      .from('problem_submissions')
      .insert({
        user_id: userId,
        profile_id: profile?.id || null,
        study_plan_id: activePlan?.id || null,
        platform: platform?.trim() || 'LeetCode',
        problem_id: questionId.trim(),
        problem_title: null,
        topic_name: guessedTopic,
        language: language.trim(),
        submitted_code: code,
        user_status: 'submitted'
      })
      .select('id, problem_id, topic_name')
      .single();

    if (submissionError) {
      throw submissionError;
    }

    const aiResult = await analyzeWithOpenRouter({
      questionId: questionId.trim(),
      topicName: guessedTopic,
      language: language.trim(),
      code,
      currentLevel: profile?.current_level || 'Beginner',
      weakTopic: analytics?.weak_topic || profile?.start_topic_slug || 'Array',
      recentMistakes: (recentMistakes || []).map((item) => item.mistake_title)
    });

    const detectedTopic = normalizeTopicName(aiResult.detected_topic || guessedTopic);
    const detectedSubtopic = aiResult.detected_subtopic || null;
    const mistakeList = Array.isArray(aiResult.mistakes) ? aiResult.mistakes : [];
    const isCorrectCode = mistakeList.length === 0;

    const { data: analysis, error: analysisError } = await supabase
      .from('ai_analyses')
      .insert({
        submission_id: submission.id,
        user_id: userId,
        detected_topic: detectedTopic,
        detected_subtopic: detectedSubtopic,
        summary: aiResult.summary || 'Analysis completed.',
        mistake_explanation: mistakeList.map((item) => `${item.title}: ${item.detail}`).join('\n'),
        corrected_code: aiResult.corrected_code || null,
        improvement_tips: (aiResult.improvement_tips || []).join('\n'),
        confidence_score: aiResult.confidence_score || 0.5
      })
      .select('id')
      .single();

    if (analysisError) {
      throw analysisError;
    }

    const repeatedMap = new Map();
    mistakeList.forEach((item) => {
      const key = `${detectedTopic}-${item.title}`;
      repeatedMap.set(key, (repeatedMap.get(key) || 0) + 1);
    });

    if (mistakeList.length) {
      const logs = mistakeList.map((mistake) => ({
        user_id: userId,
        profile_id: profile?.id || null,
        submission_id: submission.id,
        analysis_id: analysis.id,
        topic_name: detectedTopic,
        subtopic_name: detectedSubtopic,
        mistake_type: mistake.type || 'logic',
        mistake_title: mistake.title,
        mistake_detail: mistake.detail,
        severity: mistake.severity || 'medium',
        repeated_count: repeatedMap.get(`${detectedTopic}-${mistake.title}`) || 1
      }));

      const { error: logsError } = await supabase.from('mistake_logs').insert(logs);
      if (logsError) {
        throw logsError;
      }
    }

    const noteContent = isCorrectCode
      ? buildSuccessLearningNotes(aiResult, questionId.trim())
      : buildMistakeLearningNotes(aiResult, questionId.trim());

    await supabase.from('notes').insert({
      user_id: userId,
      profile_id: profile?.id || null,
      topic_name: detectedTopic,
      subtopic_name: detectedSubtopic,
      source_type: 'ai',
      title: isCorrectCode
        ? `${questionId.trim()} • learned concepts`
        : `${questionId.trim()} • mistake review`,
      content: noteContent,
      is_pinned: !isCorrectCode && mistakeList.some((item) => item.severity === 'high')
    });

    let topicProgressQuery = supabase
      .from('topic_progress')
      .select('id, total_attempts, solved_count, weak_score, confidence_score, status')
      .eq('user_id', userId)
      .eq('topic_name', detectedTopic);

    if (profile?.id) {
      topicProgressQuery = topicProgressQuery.eq('profile_id', profile.id);
    }

    const { data: existingTopicProgress } = await topicProgressQuery.maybeSingle();

    const weakIncrement = mistakeList.reduce((sum, item) => {
      return sum + (item.severity === 'high' ? 3 : item.severity === 'medium' ? 2 : 1);
    }, 0);

    if (existingTopicProgress?.id) {
      await supabase
        .from('topic_progress')
        .update({
          total_attempts: (existingTopicProgress.total_attempts || 0) + 1,
          solved_count: (existingTopicProgress.solved_count || 0) + (isCorrectCode ? 1 : 0),
          weak_score: (existingTopicProgress.weak_score || 0) + weakIncrement,
          confidence_score: Math.max(0, Math.min(100, Number((aiResult.confidence_score || 0.5) * 100))),
          status: isCorrectCode ? 'stronger' : weakIncrement >= 3 ? 'needs_revision' : 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTopicProgress.id);
    } else {
      await supabase.from('topic_progress').insert({
        user_id: userId,
        profile_id: profile?.id || null,
        topic_name: detectedTopic,
        subtopic_name: detectedSubtopic,
        total_attempts: 1,
        solved_count: isCorrectCode ? 1 : 0,
        weak_score: weakIncrement,
        confidence_score: Math.max(0, Math.min(100, Number((aiResult.confidence_score || 0.5) * 100))),
        status: isCorrectCode ? 'stronger' : weakIncrement >= 3 ? 'needs_revision' : 'in_progress'
      });
    }

    let analyticsQuery = supabase
      .from('user_analytics')
      .select('id, total_problems_attempted, total_analyses, total_mistakes, repeated_mistakes, weak_topic, streak_count')
      .eq('user_id', userId);

    if (profile?.id) {
      analyticsQuery = analyticsQuery.eq('profile_id', profile.id);
    }

    const { data: existingAnalytics } = await analyticsQuery.maybeSingle();

    const repeatedCount = mistakeList.filter((item) => /repeat|again|same/i.test(item.detail || '')).length;

    if (existingAnalytics?.id) {
      await supabase
        .from('user_analytics')
        .update({
          total_problems_attempted: (existingAnalytics.total_problems_attempted || 0) + 1,
          total_analyses: (existingAnalytics.total_analyses || 0) + 1,
          total_mistakes: (existingAnalytics.total_mistakes || 0) + mistakeList.length,
          repeated_mistakes: (existingAnalytics.repeated_mistakes || 0) + repeatedCount,
          weak_topic: detectedTopic,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingAnalytics.id);
    } else {
      await supabase.from('user_analytics').insert({
        user_id: userId,
        profile_id: profile?.id || null,
        total_problems_attempted: 1,
        total_analyses: 1,
        total_mistakes: mistakeList.length,
        repeated_mistakes: repeatedCount,
        weak_topic: detectedTopic,
        streak_count: 1,
        last_activity_at: new Date().toISOString()
      });
    }

    const reminderPayloads = buildReminderPayloads({
      recentMistakes: mistakeList.map((item) => ({ ...item, topic_name: detectedTopic })),
      weakTopic: detectedTopic,
      profileId: profile?.id || null,
      userId
    });

    if (reminderPayloads?.length) {
      await supabase.from('reminders').insert(reminderPayloads);
    }

    const { data: latestMistakes } = await supabase
      .from('mistake_logs')
      .select('mistake_title, topic_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const suggestions = buildSmartSuggestions({
      currentLevel: profile?.current_level || 'Beginner',
      weakTopic: detectedTopic,
      recentMistakes: (latestMistakes || []).map((item) => ({
        topic_name: item.topic_name,
        mistake_title: item.mistake_title
      })),
      currentPlanTasks: [],
      lastQuestionId: questionId.trim()
    });

    return renderAnalyzerView(res, {
      formData,
      result: {
        ...aiResult,
        detected_topic: detectedTopic,
        detected_subtopic: detectedSubtopic,
        smartSuggestions: suggestions,
        sourceLabel: aiResult.source_mode === 'openrouter' ? 'OpenRouter AI' : 'Fallback Analyzer',
        isCorrectCode
      },
      starterQuestions: suggestions?.revisionQuestions || []
    });
  } catch (error) {
    console.error('Analyzer submit error:', error.message);
    return renderAnalyzerView(res, {
      error: error.message || 'Analyzer failed right now.',
      formData: req.body,
      starterQuestions: []
    }, 500);
  }
};