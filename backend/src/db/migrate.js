require('dotenv').config();
const { query } = require('./index');

async function migrate() {
  console.log('Running database migrations...');

  await query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('super_admin', 'admin', 'student')),
      department VARCHAR(100),
      google_id VARCHAR(255) UNIQUE,
      avatar_url TEXT,
      branch VARCHAR(100),
      roll_number VARCHAR(50),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Tests table
    CREATE TABLE IF NOT EXISTS tests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(500) NOT NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      start_time TIMESTAMPTZ,
      end_time TIMESTAMPTZ,
      duration_minutes INTEGER NOT NULL DEFAULT 90,
      department VARCHAR(100) NOT NULL,
      settings JSONB DEFAULT '{}',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Sections table
    CREATE TABLE IF NOT EXISTS sections (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('aptitude', 'coding')),
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Questions table (aptitude)
    CREATE TABLE IF NOT EXISTS questions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL DEFAULT 'mcq',
      text TEXT NOT NULL,
      image_url TEXT,
      options JSONB,
      option_images JSONB,
      correct_answer JSONB,
      explanation TEXT,
      marks INTEGER DEFAULT 2,
      difficulty VARCHAR(10) DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
      genre VARCHAR(30) DEFAULT 'general',
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Coding problems table
    CREATE TABLE IF NOT EXISTS coding_problems (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      image_url TEXT,
      input_format TEXT,
      output_format TEXT,
      constraints TEXT,
      sample_input TEXT,
      sample_output TEXT,
      explanation TEXT,
      test_cases JSONB DEFAULT '[]',
      starter_code JSONB DEFAULT '{}',
      time_limit_seconds INTEGER DEFAULT 2,
      memory_limit_mb INTEGER DEFAULT 256,
      marks INTEGER DEFAULT 10,
      difficulty VARCHAR(10) DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
      tags TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Images table (question / option images stored directly in Postgres as bytea,
    -- so uploads survive redeploys/restarts and work across multiple backend instances
    -- without needing a shared disk or a third-party file host)
    CREATE TABLE IF NOT EXISTS images (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      data BYTEA NOT NULL,
      mimetype VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
      filename VARCHAR(255),
      size_bytes INTEGER,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_images_created_by ON images(created_by);

    -- Submissions table
    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'auto_submitted')),
      score NUMERIC(8,2) DEFAULT 0,
      max_score NUMERIC(8,2) DEFAULT 0,
      answers JSONB DEFAULT '{}',
      code_solutions JSONB DEFAULT '{}',
      code_results JSONB DEFAULT '{}',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      time_taken_seconds INTEGER,
      ip_address INET,
      flagged_questions JSONB DEFAULT '[]',
      UNIQUE(test_id, user_id)
    );

    -- Test invitations / allowed users
    CREATE TABLE IF NOT EXISTS test_invitations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255),
      invited_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Batches table
    CREATE TABLE IF NOT EXISTS batches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      department VARCHAR(100) NOT NULL,
      year_of_study INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(name, department)
    );

    -- Test-to-batch mapping (reconfigurable per drive)
    CREATE TABLE IF NOT EXISTS test_batches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      section_mapping JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(test_id, batch_id)
    );

    -- Student batch assignments (semester-based)
    CREATE TABLE IF NOT EXISTS student_batches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      year_of_study INTEGER NOT NULL DEFAULT 1,
      semester VARCHAR(20),
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, semester)
    );

    -- Add genre column to questions (if not present)
    DO $$ BEGIN
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS genre VARCHAR(30) DEFAULT 'general';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- Add batch/year columns to users
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN IF NOT EXISTS batch VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS year_of_study INTEGER DEFAULT 1;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- Add resume support to submissions
    DO $$ BEGIN
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tab_switch_count INTEGER DEFAULT 0;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS selected_problems JSONB DEFAULT '[]';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- Historical snapshot of the student's batch/year at the time they took the
    -- test, so later semester reshuffles don't rewrite past class-wise results.
    DO $$ BEGIN
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS batch_snapshot VARCHAR(100);
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS year_snapshot INTEGER;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- MCQ "set" (A/B/C/D) — lets an admin tag questions into up to 4 variants
    -- and map different batches to different sets for the same drive, to
    -- reduce answer-sharing between batches sitting the same aptitude round.
    DO $$ BEGIN
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_set CHAR(1) DEFAULT 'A';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS idx_questions_set ON questions(question_set);

    -- Question Bank — reusable MCQ / coding questions, independent of any test
    CREATE TABLE IF NOT EXISTS bank_questions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      type VARCHAR(10) NOT NULL CHECK (type IN ('mcq', 'coding')),
      data JSONB NOT NULL,
      genre VARCHAR(30) DEFAULT 'general',
      difficulty VARCHAR(10) DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
      marks INTEGER DEFAULT 2,
      tags TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_bank_questions_type ON bank_questions(type);
    CREATE INDEX IF NOT EXISTS idx_bank_questions_genre ON bank_questions(genre);

    -- Drives abstraction (dedicated placement drive with its own lifecycle)
    CREATE TABLE IF NOT EXISTS drives (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(500) NOT NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'archived')),
      start_time TIMESTAMPTZ,
      end_time TIMESTAMPTZ,
      department VARCHAR(100) NOT NULL,
      mcq_duration_minutes INTEGER DEFAULT 60,
      coding_duration_minutes INTEGER DEFAULT 120,
      passing_score NUMERIC(5,2) DEFAULT 40.00,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Drive-to-test mappings (a drive can have multiple tests)
    CREATE TABLE IF NOT EXISTS drive_tests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      round_number INTEGER DEFAULT 1,
      round_type VARCHAR(20) DEFAULT 'aptitude' CHECK (round_type IN ('aptitude', 'coding', 'combined')),
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(drive_id, test_id)
    );

    -- Drive-batch mappings
    CREATE TABLE IF NOT EXISTS drive_batches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      drive_id UUID NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
      batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(drive_id, batch_id)
    );

    -- Audit log
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id UUID,
      metadata JSONB,
      ip_address INET,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Additional indexes for performance
    CREATE INDEX IF NOT EXISTS idx_questions_genre ON questions(genre);
    CREATE INDEX IF NOT EXISTS idx_submissions_tab_switch ON submissions(tab_switch_count);
    CREATE INDEX IF NOT EXISTS idx_test_batches_test_id ON test_batches(test_id);
    CREATE INDEX IF NOT EXISTS idx_test_batches_batch_id ON test_batches(batch_id);
    CREATE INDEX IF NOT EXISTS idx_student_batches_user_id ON student_batches(user_id);
    CREATE INDEX IF NOT EXISTS idx_student_batches_batch_id ON student_batches(batch_id);
    CREATE INDEX IF NOT EXISTS idx_users_batch ON users(batch);

    -- ═══════════════════════════════════════════════════════════
    -- GAMIFICATION SYSTEM
    -- ═══════════════════════════════════════════════════════════

    -- Student XP & Leveling
    CREATE TABLE IF NOT EXISTS student_xp (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      xp_points BIGINT DEFAULT 0,
      level INTEGER DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS xp_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      reason VARCHAR(255),
      reference_type VARCHAR(50),
      reference_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_xp_transactions_user ON xp_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_xp_transactions_created ON xp_transactions(created_at);

    -- Achievement Badges
    CREATE TABLE IF NOT EXISTS achievement_definitions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      key VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      icon_url TEXT,
      criteria JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS student_achievements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id UUID NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
      earned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, achievement_id)
    );
    CREATE INDEX IF NOT EXISTS idx_student_achievements_user ON student_achievements(user_id);

    -- Streak Tracking
    CREATE TABLE IF NOT EXISTS streaks (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_activity_date DATE
    );

    -- Daily Challenges
    CREATE TABLE IF NOT EXISTS daily_challenges (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      date DATE UNIQUE NOT NULL,
      question_id UUID,
      type VARCHAR(20) NOT NULL CHECK (type IN ('mcq', 'coding')),
      xp_reward INTEGER DEFAULT 20,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_challenge_submissions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      challenge_id UUID NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answer JSONB,
      correct BOOLEAN DEFAULT false,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(challenge_id, user_id)
    );

    -- Study Resources
    CREATE TABLE IF NOT EXISTS study_resources (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(500) NOT NULL,
      description TEXT,
      type VARCHAR(20) NOT NULL CHECK (type IN ('note', 'video', 'practice')),
      genre VARCHAR(50),
      url TEXT,
      completed_count INTEGER DEFAULT 0,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS resource_completions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      resource_id UUID NOT NULL REFERENCES study_resources(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(resource_id, user_id)
    );

    -- Mock Interview Sessions
    CREATE TABLE IF NOT EXISTS mock_interview_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      difficulty VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
      status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
      mcq_score NUMERIC(8,2) DEFAULT 0,
      coding_score NUMERIC(8,2) DEFAULT 0,
      total_score NUMERIC(8,2) DEFAULT 0,
      max_score NUMERIC(8,2) DEFAULT 0,
      section_feedback JSONB DEFAULT '[]',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS mock_interview_answers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      session_id UUID NOT NULL REFERENCES mock_interview_sessions(id) ON DELETE CASCADE,
      question_id UUID,
      type VARCHAR(10) NOT NULL CHECK (type IN ('mcq', 'coding')),
      question_data JSONB,
      answer TEXT,
      correct BOOLEAN DEFAULT false,
      marks INTEGER DEFAULT 0,
      max_marks INTEGER DEFAULT 0,
      time_taken_seconds INTEGER DEFAULT 0
    );

    -- Gamification indexes
    CREATE INDEX IF NOT EXISTS idx_xp_transactions_created_at ON xp_transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_daily_challenges_date ON daily_challenges(date);
    CREATE INDEX IF NOT EXISTS idx_study_resources_type ON study_resources(type);
    CREATE INDEX IF NOT EXISTS idx_study_resources_genre ON study_resources(genre);
    CREATE INDEX IF NOT EXISTS idx_mock_interview_sessions_user ON mock_interview_sessions(user_id);

    -- Seed default achievements
    INSERT INTO achievement_definitions (key, name, description, criteria) VALUES
      ('first_test', 'First Steps', 'Complete your first test', '{"type": "test_count", "count": 1}'),
      ('score_90', 'Top Performer', 'Score 90% or above in any test', '{"type": "score_threshold", "threshold": 90}'),
      ('streak_7', 'Consistent', 'Maintain a 7-day streak', '{"type": "streak", "days": 7}'),
      ('streak_30', 'Dedicated', 'Maintain a 30-day streak', '{"type": "streak", "days": 30}'),
      ('three_hard', 'Problem Solver', 'Solve 3 hard coding problems', '{"type": "hard_problems", "count": 3}'),
      ('daily_champion', 'Daily Champion', 'Complete a daily challenge', '{"type": "daily_challenge", "count": 1}'),
      ('xp_1000', 'Century Club', 'Earn 1000 XP', '{"type": "xp_total", "xp": 1000}'),
      ('xp_5000', 'XP Master', 'Earn 5000 XP', '{"type": "xp_total", "xp": 5000}'),
      ('level_5', 'Rising Star', 'Reach Level 5', '{"type": "level", "level": 5}'),
      ('level_10', 'Veteran', 'Reach Level 10', '{"type": "level", "level": 10}')
    ON CONFLICT (key) DO NOTHING;

    -- ═══════════════════════════════════════════════════════════
    -- COMMUNICATION & NOTIFICATIONS
    -- ═══════════════════════════════════════════════════════════

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(500) NOT NULL,
      body TEXT,
      data JSONB DEFAULT '{}',
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

    -- SMS opt-in for users
    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- Test messages (student-to-admin during tests)
    CREATE TABLE IF NOT EXISTS test_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_from_student BOOLEAN DEFAULT true,
      resolved BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_test_messages_test ON test_messages(test_id);
    CREATE INDEX IF NOT EXISTS idx_test_messages_user ON test_messages(user_id);

    -- Announcements table
    CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(500) NOT NULL,
      body TEXT NOT NULL,
      priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      target_role VARCHAR(20) DEFAULT 'all' CHECK (target_role IN ('all', 'student', 'admin')),
      target_batches JSONB DEFAULT '[]',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_role ON announcements(target_role);
    CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(priority);
    CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at);

    -- Forum threads for coding problems
    CREATE TABLE IF NOT EXISTS forum_threads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      problem_id UUID NOT NULL REFERENCES coding_problems(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_forum_threads_problem ON forum_threads(problem_id);

    -- Forum replies
    CREATE TABLE IF NOT EXISTS forum_replies (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      parent_reply_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE,
      upvotes INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_forum_replies_thread ON forum_replies(thread_id);

    -- Forum upvotes
    CREATE TABLE IF NOT EXISTS forum_upvotes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      reply_id UUID NOT NULL REFERENCES forum_replies(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(reply_id, user_id)
    );

    -- ═══════════════════════════════════════════════════════════
    -- CHEATING DETECTION
    -- ═══════════════════════════════════════════════════════════

    -- Keystroke logs for cheating analysis
    CREATE TABLE IF NOT EXISTS keystroke_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      question_id UUID,
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('keydown', 'paste', 'focus_change', 'copy', 'answer_change')),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_keystroke_logs_submission ON keystroke_logs(submission_id);
    CREATE INDEX IF NOT EXISTS idx_keystroke_logs_test ON keystroke_logs(test_id);
    CREATE INDEX IF NOT EXISTS idx_keystroke_logs_event ON keystroke_logs(event_type);

    -- Suspicious activity flags
    CREATE TABLE IF NOT EXISTS suspicious_flags (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
      user_name VARCHAR(255),
      email VARCHAR(255),
      roll_number VARCHAR(50),
      suspicion_score INTEGER DEFAULT 0,
      reasons JSONB DEFAULT '[]',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_suspicious_flags_test ON suspicious_flags(test_id);
    CREATE INDEX IF NOT EXISTS idx_suspicious_flags_score ON suspicious_flags(suspicion_score DESC);

    DO $$ BEGIN
      ALTER TABLE suspicious_flags ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT false;
      ALTER TABLE suspicious_flags ADD COLUMN IF NOT EXISTS severity VARCHAR(10) DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high', 'critical'));
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- Proctoring snapshots table
    CREATE TABLE IF NOT EXISTS proctoring_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      image_url TEXT,
      face_detected BOOLEAN DEFAULT true,
      faces_count INTEGER DEFAULT 1,
      gaze_ok BOOLEAN DEFAULT true,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_proctoring_snapshots_submission ON proctoring_snapshots(submission_id);

    -- Proctoring flags table
    CREATE TABLE IF NOT EXISTS proctoring_flags (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN ('face_absent', 'multiple_faces', 'gaze_deviation')),
      severity VARCHAR(10) NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
      timestamp TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_proctoring_flags_submission ON proctoring_flags(submission_id);

    -- Test shuffles table
    CREATE TABLE IF NOT EXISTS test_shuffles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_order JSONB DEFAULT '{}',
      option_orders JSONB DEFAULT '{}',
      seed VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(test_id, user_id)
    );

    -- Add security columns to existing tables
    DO $$ BEGIN
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS fingerprint_hash VARCHAR(255);
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS fullscreen_exit_count INTEGER DEFAULT 0;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS paste_attempts INTEGER DEFAULT 0;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS keystroke_count INTEGER DEFAULT 0;
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS device_fingerprint JSONB DEFAULT '{}';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS time_bomb JSONB DEFAULT '{"enabled":false,"duration_seconds":0}';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- ═══════════════════════════════════════════════════════════
    -- CODING PLATFORM ENHANCEMENTS
    -- ═══════════════════════════════════════════════════════════

    -- File structure for multi-file coding problems
    DO $$ BEGIN
      ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS file_structure JSONB DEFAULT '[]';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- Code snapshots for playback timeline
    CREATE TABLE IF NOT EXISTS code_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
      problem_id UUID REFERENCES coding_problems(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      language VARCHAR(50) NOT NULL,
      snapshot_type VARCHAR(50) NOT NULL DEFAULT 'auto' CHECK (snapshot_type IN ('keystroke','paste','auto','manual')),
      file_path VARCHAR(500) DEFAULT 'main',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_snapshots_submission ON code_snapshots(submission_id);
    CREATE INDEX IF NOT EXISTS idx_code_snapshots_problem ON code_snapshots(problem_id);
    CREATE INDEX IF NOT EXISTS idx_code_snapshots_user ON code_snapshots(user_id);
    CREATE INDEX IF NOT EXISTS idx_code_snapshots_created ON code_snapshots(created_at);

    -- Code quality reports
    CREATE TABLE IF NOT EXISTS code_quality_reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      problem_id UUID REFERENCES coding_problems(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language VARCHAR(50) NOT NULL,
      lines_of_code INTEGER DEFAULT 0,
      total_lines INTEGER DEFAULT 0,
      comment_lines INTEGER DEFAULT 0,
      blank_lines INTEGER DEFAULT 0,
      comment_ratio NUMERIC(5,2) DEFAULT 0,
      cyclomatic_complexity INTEGER DEFAULT 1,
      num_functions INTEGER DEFAULT 0,
      num_classes INTEGER DEFAULT 0,
      max_nesting_depth INTEGER DEFAULT 0,
      maintainability_index INTEGER DEFAULT 100,
      readability_score INTEGER DEFAULT 50,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_quality_submission ON code_quality_reports(submission_id);
    CREATE INDEX IF NOT EXISTS idx_code_quality_user ON code_quality_reports(user_id);

    -- Saved custom test cases
    CREATE TABLE IF NOT EXISTS saved_custom_tests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      problem_id UUID NOT NULL REFERENCES coding_problems(id) ON DELETE CASCADE,
      input TEXT NOT NULL,
      expected_output TEXT,
      name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_saved_custom_tests_user ON saved_custom_tests(user_id);
    CREATE INDEX IF NOT EXISTS idx_saved_custom_tests_problem ON saved_custom_tests(problem_id);

    -- Indexes for performance with 1000 concurrent users
    CREATE INDEX IF NOT EXISTS idx_submissions_test_id ON submissions(test_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
    CREATE INDEX IF NOT EXISTS idx_questions_section_id ON questions(section_id);
    CREATE INDEX IF NOT EXISTS idx_coding_problems_section_id ON coding_problems(section_id);
    CREATE INDEX IF NOT EXISTS idx_sections_test_id ON sections(test_id);
    CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(status);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);

    -- ═══════════════════════════════════════════════════════════
    -- MULTI-TENANT ARCHITECTURE
    -- ═══════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      domain VARCHAR(255) UNIQUE,
      logo_url TEXT,
      primary_color VARCHAR(7) DEFAULT '#2F5D56',
      secondary_color VARCHAR(7) DEFAULT '#565C86',
      favicon_url TEXT,
      is_active BOOLEAN DEFAULT true,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE tests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE batches ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE drives ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tests_tenant ON tests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_batches_tenant ON batches(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_drives_tenant ON drives(tenant_id);

    -- ═══════════════════════════════════════════════════════════
    -- RBAC: ROLES & PERMISSIONS
    -- ═══════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(50) UNIQUE NOT NULL CHECK (name IN ('super_admin', 'dept_admin', 'proctor', 'auditor', 'student')),
      description TEXT,
      permissions JSONB DEFAULT '[]',
      tenant_id UUID REFERENCES tenants(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id UUID REFERENCES tenants(id),
      department VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, role_id)
    );

    -- Seed default roles
    INSERT INTO roles (name, description, permissions) VALUES
      ('super_admin', 'Full system access', '["*"]'),
      ('dept_admin', 'Department-level administration', '["tests:create","tests:edit","tests:delete","tests:publish","results:view","results:export","users:view","users:create","users:edit","question-bank:manage","batches:manage"]'),
      ('proctor', 'Live exam monitoring', '["proctor:view-sessions","proctor:terminate","proctor:attendance","results:view"]'),
      ('auditor', 'Read-only access to logs and results', '["audit:view","audit:export","results:view"]'),
      ('student', 'Test taking and own results', '[]')
    ON CONFLICT (name) DO NOTHING;

    -- ═══════════════════════════════════════════════════════════
    -- USAGE QUOTAS & BILLING
    -- ═══════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS usage_quotas (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      max_students INTEGER DEFAULT 100,
      max_tests INTEGER DEFAULT 50,
      max_storage_mb INTEGER DEFAULT 1000,
      max_api_calls INTEGER DEFAULT 10000,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('students', 'tests', 'storage', 'api_calls')),
      value INTEGER DEFAULT 1,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_usage_records_type ON usage_records(metric_type);
    CREATE INDEX IF NOT EXISTS idx_usage_quotas_tenant ON usage_quotas(tenant_id);

    -- ═══════════════════════════════════════════════════════════
    -- TEST TEMPLATES
    -- ═══════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS test_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      config JSONB NOT NULL DEFAULT '{}',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ═══════════════════════════════════════════════════════════
    -- QUESTION COLLABORATION & VERSIONING
    -- ═══════════════════════════════════════════════════════════

    DO $$ BEGIN
      ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'published', 'archived'));
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'published'
        CHECK (status IN ('draft', 'review', 'published', 'archived'));
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS question_versions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      question_id UUID NOT NULL,
      source_type VARCHAR(10) NOT NULL CHECK (source_type IN ('bank', 'test')),
      data JSONB NOT NULL,
      version INTEGER NOT NULL,
      changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_question_versions_q ON question_versions(question_id);

    -- ═══════════════════════════════════════════════════════════
    -- BILINGUAL QUESTION SUPPORT
    -- ═══════════════════════════════════════════════════════════

    DO $$ BEGIN
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS text_secondary TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS options_secondary JSONB;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS description_secondary TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- ═══════════════════════════════════════════════════════════
    -- SCHEDULED PUBLISHING
    -- ═══════════════════════════════════════════════════════════

    DO $$ BEGIN
      ALTER TABLE tests ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- ═══════════════════════════════════════════════════════════
    -- 2FA / TOTP
    -- ═══════════════════════════════════════════════════════════

    DO $$ BEGIN
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- ═══════════════════════════════════════════════════════════
    -- GDPR CONSENT
    -- ═══════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS consent_records (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      consent_type VARCHAR(50) NOT NULL,
      granted BOOLEAN NOT NULL DEFAULT true,
      granted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, consent_type)
    );

    -- ═══════════════════════════════════════════════════════════
    -- PARAMETERIZED / TEMPLATE QUESTIONS
    -- ═══════════════════════════════════════════════════════════

    DO $$ BEGIN
      ALTER TABLE bank_questions ADD COLUMN IF NOT EXISTS template JSONB;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    DO $$ BEGIN
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS template JSONB;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

  -- ═══════════════════════════════════════════════════════════
  -- ADVANCED ANALYTICS & REPORTING TABLES
  -- ═══════════════════════════════════════════════════════════

  CREATE TABLE IF NOT EXISTS scheduled_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(500) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    schedule VARCHAR(20) NOT NULL CHECK (schedule IN ('weekly', 'fortnightly', 'monthly')),
    recipients JSONB NOT NULL DEFAULT '[]',
    enabled BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_sent_at TIMESTAMPTZ,
    next_send_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS threshold_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(500) NOT NULL,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    email_recipients JSONB NOT NULL DEFAULT '[]',
    enabled BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Report builder saved reports
  CREATE TABLE IF NOT EXISTS saved_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(500) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- ═══════════════════════════════════════════════════════════
  -- THIRD-PARTY INTEGRATIONS & NEW FEATURES
  -- ═══════════════════════════════════════════════════════════

  -- Add phone column to users (for SMS)
  DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_opted_in BOOLEAN DEFAULT false;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END $$;

  -- Calendar tokens for Google/Outlook sync
  DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_calendar_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS outlook_calendar_refresh_token TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END $$;

  -- Payment plans table
  CREATE TABLE IF NOT EXISTS payment_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    duration_days INTEGER DEFAULT 30,
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Payment transactions table
  CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES payment_plans(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
    provider_txn_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);

  -- Webhook configs (Slack/Discord)
  CREATE TABLE IF NOT EXISTS webhook_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(10) NOT NULL CHECK (type IN ('slack', 'discord')),
    webhook_url TEXT NOT NULL,
    events JSONB DEFAULT '[]',
    enabled BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- SSO state tracking
  CREATE TABLE IF NOT EXISTS sso_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(20) NOT NULL,
    state VARCHAR(255) NOT NULL UNIQUE,
    data JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- LMS sync logs
  CREATE TABLE IF NOT EXISTS lms_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('roster', 'scores')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
    details JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- ATS push logs
  CREATE TABLE IF NOT EXISTS ats_push_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_ids JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
    provider_response JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- SMS history
  CREATE TABLE IF NOT EXISTS sms_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    phone VARCHAR(20) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    provider_sid VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Interview video meeting info (add to existing if needed)
  DO $$ BEGIN
    ALTER TABLE mock_interview_sessions ADD COLUMN IF NOT EXISTS meeting_url TEXT;
    ALTER TABLE mock_interview_sessions ADD COLUMN IF NOT EXISTS meeting_password VARCHAR(100);
    ALTER TABLE mock_interview_sessions ADD COLUMN IF NOT EXISTS meeting_provider VARCHAR(10);
  EXCEPTION WHEN duplicate_column THEN NULL;
  END $$;

  -- ═══════════════════════════════════════════════════════════
  -- STUDENT EXPERIENCE & SELF-SERVICE FEATURES
  -- ═══════════════════════════════════════════════════════════

  DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_url VARCHAR(500);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_url TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END $$;

  CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    technologies JSONB DEFAULT '[]',
    project_url VARCHAR(500),
    github_url VARCHAR(500),
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

  CREATE TABLE IF NOT EXISTS certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    issuer VARCHAR(500),
    issue_date DATE,
    expiry_date DATE,
    credential_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_certifications_user_id ON certifications(user_id);

  CREATE TABLE IF NOT EXISTS practice_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    genre VARCHAR(30) NOT NULL,
    question_count INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_id ON practice_sessions(user_id);

  CREATE TABLE IF NOT EXISTS bookmarked_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, question_id)
  );
  CREATE INDEX IF NOT EXISTS idx_bookmarked_questions_user_id ON bookmarked_questions(user_id);

  CREATE TABLE IF NOT EXISTS question_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issue_type VARCHAR(20) NOT NULL CHECK (issue_type IN ('wrong_answer','ambiguous','formatting','other')),
    comment TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','reviewed','resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_question_feedback_question_id ON question_feedback(question_id);
  CREATE INDEX IF NOT EXISTS idx_question_feedback_status ON question_feedback(status);
  `);

  console.log('✅ Migrations complete.');
  process.exit(0);
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
