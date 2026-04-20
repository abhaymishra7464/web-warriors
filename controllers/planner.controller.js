import supabase from '../config/supabase.js';
import { ROADMAP_LIBRARY, TOPIC_LIBRARY, getRoadmapBySlug, buildStarterTasks } from '../services/roadmaps.service.js';

export const renderCoursesHub = async (req, res) => {
  let activeProfiles = [];
  let activePlans = [];

  try {
    const { data: profiles } = await supabase
      .from('dsa_profiles')
      .select('id, profile_name, language, current_level, target_days, start_topic_slug, is_active, created_at')
      .eq('user_id', req.session.user.id)
      .order('created_at', { ascending: false });

    activeProfiles = profiles || [];

    if (activeProfiles.length) {
      const profileIds = activeProfiles.map((profile) => profile.id);
      const { data: plans } = await supabase
        .from('study_plans')
        .select('id, profile_id, title, duration_days, status, start_date, end_date, created_at')
        .in('profile_id', profileIds)
        .order('created_at', { ascending: false });

      activePlans = plans || [];
    }
  } catch (error) {
    console.error('Courses hub load error:', error.message);
  }

  res.render('courses/index', {
    pageTitle: 'Courses',
    pageCss: '/css/dashboard.css',
    roadmaps: ROADMAP_LIBRARY,
    topicLibrary: TOPIC_LIBRARY,
    activeProfiles,
    activePlans
  });
};

export const renderPlannerBuilder = (req, res) => {
  const selectedRoadmap = getRoadmapBySlug(req.query.roadmap) || getRoadmapBySlug('dsa-foundation-30');

  res.render('planner/new', {
    pageTitle: 'Create DSA Planner',
    pageCss: '/css/dashboard.css',
    roadmaps: ROADMAP_LIBRARY,
    topicLibrary: TOPIC_LIBRARY,
    formData: {
      profileName: '',
      language: 'Java',
      currentLevel: 'Beginner',
      targetDays: selectedRoadmap.durationDays,
      startTopic: 'Array',
      roadmapSlug: selectedRoadmap.slug,
      knownTopics: '',
      goalNotes: ''
    },
    error: null
  });
};

export const createPlanner = async (req, res) => {
  try {
    const {
      profileName,
      language,
      currentLevel,
      targetDays,
      startTopic,
      roadmapSlug,
      knownTopics,
      goalNotes
    } = req.body;

    const formData = {
      profileName,
      language,
      currentLevel,
      targetDays,
      startTopic,
      roadmapSlug,
      knownTopics,
      goalNotes
    };

    const roadmap = getRoadmapBySlug(roadmapSlug);

    if (!profileName?.trim() || !language?.trim() || !currentLevel?.trim() || !startTopic?.trim() || !roadmap) {
      return res.status(400).render('planner/new', {
        pageTitle: 'Create DSA Planner',
        pageCss: '/css/dashboard.css',
        roadmaps: ROADMAP_LIBRARY,
        topicLibrary: TOPIC_LIBRARY,
        formData,
        error: 'Please fill all required planner fields.'
      });
    }

    const finalTargetDays = Number(targetDays) || roadmap.durationDays;
    const knownTopicsList = String(knownTopics || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const knownTopicsText = knownTopics?.trim() || null;
    const goalNotesText = goalNotes?.trim() || null;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + finalTargetDays - 1);

    await supabase
      .from('dsa_profiles')
      .update({ is_active: false })
      .eq('user_id', req.session.user.id);

    const { data: profile, error: profileError } = await supabase
      .from('dsa_profiles')
      .insert({
        user_id: req.session.user.id,
        profile_name: profileName.trim(),
        language: language.trim(),
        current_level: currentLevel.trim(),
        target_days: finalTargetDays,
        start_topic_slug: startTopic.trim(),
        is_active: true
      })
      .select('id, profile_name')
      .single();

    if (profileError) {
      throw profileError;
    }

    const { data: studyPlan, error: planError } = await supabase
      .from('study_plans')
      .insert({
        user_id: req.session.user.id,
        profile_id: profile.id,
        title: `${profile.profile_name} • ${roadmap.title}`,
        duration_days: finalTargetDays,
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        status: 'active'
      })
      .select('id')
      .single();

    if (planError) {
      throw planError;
    }

    const starterTasks = buildStarterTasks({
      roadmap,
      targetDays: finalTargetDays,
      startTopic,
      currentLevel,
      knownTopics: knownTopicsList
    });

    const taskPayload = starterTasks.map((task) => ({
      study_plan_id: studyPlan.id,
      day_number: task.dayNumber,
      topic_name: task.topicName,
      subtopic_name: task.subtopicName,
      task_title: task.taskTitle,
      task_type: task.taskType,
      problem_ref: task.problemRef,
      status: task.status
    }));

    if (taskPayload.length) {
      const { error: taskError } = await supabase.from('study_plan_tasks').insert(taskPayload);
      if (taskError) {
        throw taskError;
      }
    }

    await supabase.from('notes').insert({
      user_id: req.session.user.id,
      profile_id: profile.id,
      topic_name: startTopic.trim(),
      source_type: 'manual',
      title: 'Planner setup notes',
      content: `Known topics: ${knownTopicsText || 'Not provided'}\n\nGoal notes: ${goalNotesText || 'Not provided'}\n\nSelected roadmap: ${roadmap.title}`,
      is_pinned: true
    });

    await supabase.from('reminders').insert({
      user_id: req.session.user.id,
      profile_id: profile.id,
      reminder_type: 'planner-start',
      title: `Start ${startTopic.trim()} track`,
      message: `Day 1 se start karo. Pehla topic: ${starterTasks[0]?.taskTitle || startTopic.trim()}`,
      due_at: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
      status: 'pending'
    });

    await supabase.from('user_analytics').upsert({
      user_id: req.session.user.id,
      profile_id: profile.id,
      total_problems_attempted: 0,
      total_analyses: 0,
      total_mistakes: 0,
      repeated_mistakes: 0,
      weak_topic: startTopic.trim(),
      streak_count: 0,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,profile_id' });

    req.session.authMessage = 'DSA planner created successfully.';
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Planner create error:', error.message);
    return res.status(500).render('planner/new', {
      pageTitle: 'Create DSA Planner',
      pageCss: '/css/dashboard.css',
      roadmaps: ROADMAP_LIBRARY,
      topicLibrary: TOPIC_LIBRARY,
      formData: req.body,
      error: error.message || 'Unable to create planner right now.'
    });
  }
};
