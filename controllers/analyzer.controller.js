import supabase from '../config/supabase.js';
import { analyzeWithOpenRouter } from '../services/openrouter.service.js';
import { buildReminderPayloads, buildSmartSuggestions } from '../services/recommendation.service.js';
import { getQuestionsForTopic, normalizeTopicName } from '../services/question-bank.service.js';

const ANALYZER_CSS = '/css/dashboard.css';

const renderAnalyzerView = (res, payload = {}, status = 200) => {
  return res.status(status).render('analyzer/index', {
    pageTitle: 'AI Analyzer',
    pageCss: ANALYZER_CSS,
    formData: {
      platform: 'LeetCode',
      questionId: '',
      problemTitle: '',
      topicName: 'Array',
      language: 'Java',
      code: '',
      ...payload.formData
    },
    result: null,
    error: null,
    ...payload
  });
};

export const renderAnalyzer = async (req, res) => {
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
      language: profile?.language || 'Java',
      topicName: starterTopic
    },
    starterQuestions
  });
};

export const submitAnalyzer = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { platform, questionId, problemTitle, topicName, language, code } = req.body;
    const formData = { platform, questionId, problemTitle, topicName, language, code };

    if (!questionId?.trim() || !code?.trim() || !language?.trim()) {
      return renderAnalyzerView(res, {
        error: 'Question id, language and code are required.',
        formData
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

    const { data: submission, error: submissionError } = await supabase
      .from('problem_submissions')
      .insert({
        user_id: userId,
        profile_id: profile?.id || null,
        study_plan_id: activePlan?.id || null,
        platform: platform?.trim() || 'LeetCode',
        problem_id: questionId.trim(),
        problem_title: problemTitle?.trim() || null,
        topic_name: normalizeTopicName(topicName),
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
      questionId,
      topicName: normalizeTopicName(topicName),
      language,
      code,
      currentLevel: profile?.current_level || 'Beginner',
      weakTopic: analytics?.weak_topic || profile?.start_topic_slug || 'Array',
      recentMistakes: (recentMistakes || []).map((item) => item.mistake_title)
    });

    const { data: analysis, error: analysisError } = await supabase
      .from('ai_analyses')
      .insert({
        submission_id: submission.id,
        user_id: userId,
        detected_topic: aiResult.detected_topic,
        detected_subtopic: aiResult.detected_subtopic,
        summary: aiResult.summary,
        mistake_explanation: aiResult.mistakes.map((item) => `${item.title}: ${item.detail}`).join('\n'),
        corrected_code: aiResult.corrected_code,
        improvement_tips: aiResult.improvement_tips.join('\n'),
        confidence_score: aiResult.confidence_score
      })
      .select('id')
      .single();

    if (analysisError) {
      throw analysisError;
    }

    const repeatedMap = new Map();
    aiResult.mistakes.forEach((item) => {
      const key = `${normalizeTopicName(aiResult.detected_topic)}-${item.title}`;
      repeatedMap.set(key, (repeatedMap.get(key) || 0) + 1);
    });

    if (aiResult.mistakes.length) {
      const logs = aiResult.mistakes.map((mistake) => ({
        user_id: userId,
        profile_id: profile?.id || null,
        submission_id: submission.id,
        analysis_id: analysis.id,
        topic_name: normalizeTopicName(aiResult.detected_topic),
        subtopic_name: aiResult.detected_subtopic,
        mistake_type: mistake.type || 'logic',
        mistake_title: mistake.title,
        mistake_detail: mistake.detail,
        severity: mistake.severity || 'medium',
        repeated_count: repeatedMap.get(`${normalizeTopicName(aiResult.detected_topic)}-${mistake.title}`) || 1
      }));

      const { error: logsError } = await supabase.from('mistake_logs').insert(logs);
      if (logsError) {
        throw logsError;
      }
    }

    const noteContent = [
      `Summary: ${aiResult.summary}`,
      '',
      'Improvement Tips:',
      ...aiResult.improvement_tips.map((item, index) => `${index + 1}. ${item}`)
    ].join('\n');

    await supabase.from('notes').insert({
      user_id: userId,
      profile_id: profile?.id || null,
      topic_name: normalizeTopicName(aiResult.detected_topic),
      subtopic_name: aiResult.detected_subtopic,
      source_type: 'ai',
      title: `${questionId.trim()} • ${normalizeTopicName(aiResult.detected_topic)} review`,
      content: noteContent,
      is_pinned: aiResult.mistakes.some((item) => item.severity === 'high')
    });

    let topicProgressQuery = supabase
      .from('topic_progress')
      .select('id, total_attempts, solved_count, weak_score, confidence_score, status')
      .eq('user_id', userId)
      .eq('topic_name', normalizeTopicName(aiResult.detected_topic));

    if (profile?.id) {
      topicProgressQuery = topicProgressQuery.eq('profile_id', profile.id);
    }

    const { data: existingTopicProgress } = await topicProgressQuery.maybeSingle();

    const weakIncrement = aiResult.mistakes.reduce((sum, item) => sum + (item.severity === 'high' ? 3 : item.severity === 'medium' ? 2 : 1), 0);

    if (existingTopicProgress?.id) {
      await supabase
        .from('topic_progress')
        .update({
          total_attempts: (existingTopicProgress.total_attempts || 0) + 1,
          weak_score: (existingTopicProgress.weak_score || 0) + weakIncrement,
          confidence_score: Math.max(0, Math.min(100, Number((aiResult.confidence_score || 0.5) * 100))),
          status: weakIncrement >= 3 ? 'needs_revision' : 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTopicProgress.id);
    } else {
      await supabase.from('topic_progress').insert({
        user_id: userId,
        profile_id: profile?.id || null,
        topic_name: normalizeTopicName(aiResult.detected_topic),
        subtopic_name: aiResult.detected_subtopic,
        total_attempts: 1,
        solved_count: 0,
        weak_score: weakIncrement,
        confidence_score: Math.max(0, Math.min(100, Number((aiResult.confidence_score || 0.5) * 100))),
        status: weakIncrement >= 3 ? 'needs_revision' : 'in_progress'
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

    const repeatedCount = aiResult.mistakes.filter((item) => /repeat|again|same/i.test(item.detail || '')).length;

    if (existingAnalytics?.id) {
      await supabase
        .from('user_analytics')
        .update({
          total_problems_attempted: (existingAnalytics.total_problems_attempted || 0) + 1,
          total_analyses: (existingAnalytics.total_analyses || 0) + 1,
          total_mistakes: (existingAnalytics.total_mistakes || 0) + aiResult.mistakes.length,
          repeated_mistakes: (existingAnalytics.repeated_mistakes || 0) + repeatedCount,
          weak_topic: normalizeTopicName(aiResult.detected_topic),
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
        total_mistakes: aiResult.mistakes.length,
        repeated_mistakes: repeatedCount,
        weak_topic: normalizeTopicName(aiResult.detected_topic),
        streak_count: 1,
        last_activity_at: new Date().toISOString()
      });
    }

    const reminderPayloads = buildReminderPayloads({
      recentMistakes: aiResult.mistakes.map((item) => ({ ...item, topic_name: normalizeTopicName(aiResult.detected_topic) })),
      weakTopic: normalizeTopicName(aiResult.detected_topic),
      profileId: profile?.id || null,
      userId
    });
    await supabase.from('reminders').insert(reminderPayloads);

    const { data: latestMistakes } = await supabase
      .from('mistake_logs')
      .select('mistake_title, topic_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const suggestions = buildSmartSuggestions({
      currentLevel: profile?.current_level || 'Beginner',
      weakTopic: normalizeTopicName(aiResult.detected_topic),
      recentMistakes: (latestMistakes || []).map((item) => ({ topic_name: item.topic_name, mistake_title: item.mistake_title })),
      currentPlanTasks: [],
      lastQuestionId: questionId
    });

    return renderAnalyzerView(res, {
      formData,
      result: {
        ...aiResult,
        smartSuggestions: suggestions,
        sourceLabel: aiResult.source_mode === 'openrouter' ? 'OpenRouter AI' : 'Fallback Analyzer'
      },
      starterQuestions: suggestions.revisionQuestions
    });
  } catch (error) {
    console.error('Analyzer submit error:', error.message);
    return renderAnalyzerView(res, {
      error: error.message || 'Analyzer failed right now.',
      formData: req.body
    }, 500);
  }
};
