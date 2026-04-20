import supabase from '../config/supabase.js';
import { buildSmartSuggestions } from './recommendation.service.js';

export const getDashboardPayload = async (userId) => {
  const [profileRes, planRes, mistakesRes, notesRes, analyticsRes, remindersRes] = await Promise.all([
    supabase
      .from('dsa_profiles')
      .select('id, profile_name, language, current_level, target_days, start_topic_slug, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('study_plans')
      .select('id, title, duration_days, status, start_date, end_date, created_at, profile_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('mistake_logs')
      .select('id, topic_name, subtopic_name, mistake_title, severity, repeated_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('notes')
      .select('id, title, topic_name, content, is_pinned, created_at')
      .eq('user_id', userId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('user_analytics')
      .select('total_problems_attempted, total_analyses, total_mistakes, repeated_mistakes, weak_topic, streak_count, last_activity_at, profile_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('reminders')
      .select('id, title, message, due_at, status, reminder_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)
  ]);

  const activeProfile = profileRes.data || null;
  const activePlan = planRes.data || null;
  const recentMistakes = mistakesRes.data || [];
  const notePreview = notesRes.data || [];
  const reminders = remindersRes.data || [];

  let todayTasks = [];
  if (activePlan) {
    const { data: taskRows } = await supabase
      .from('study_plan_tasks')
      .select('id, day_number, topic_name, subtopic_name, task_title, task_type, problem_ref, status, completed_at, study_plan_id, created_at')
      .eq('study_plan_id', activePlan.id)
      .order('day_number', { ascending: true })
      .limit(8);
    todayTasks = taskRows || [];
  }

  const analytics = analyticsRes.data || {
    total_problems_attempted: 0,
    total_analyses: 0,
    total_mistakes: 0,
    repeated_mistakes: 0,
    weak_topic: activeProfile?.start_topic_slug || 'Array',
    streak_count: 0,
    last_activity_at: null
  };

  const completionPercent = activePlan && todayTasks.length
    ? Math.round((todayTasks.filter((task) => task.status === 'completed').length / todayTasks.length) * 100)
    : 0;

  const smartSuggestions = buildSmartSuggestions({
    currentLevel: activeProfile?.current_level || 'Beginner',
    weakTopic: analytics.weak_topic,
    recentMistakes,
    currentPlanTasks: todayTasks,
    lastQuestionId: ''
  });

  return {
    activeProfile,
    activePlan,
    recentMistakes,
    notePreview,
    reminders,
    analytics,
    todayTasks,
    completionPercent,
    smartSuggestions
  };
};
