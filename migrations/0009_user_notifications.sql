-- user notifications table
-- stores pending notifications for users about completed file processing

create table if not exists user_notifications (
  id text primary key default (hex(randomblob(16))),
  username text not null,
  notification_type text not null check (notification_type in ('file_processing_complete', 'file_processing_error')),
  title text not null,
  message text not null,
  file_key text,
  file_name text,
  metadata text, -- json string for additional data
  is_read boolean default false,
  created_at text default current_timestamp,
  read_at text,
  foreign key (username) references user_openai_keys(username) on delete cascade
);

-- index for efficient user notification queries
create index if not exists idx_user_notifications_username_unread 
  on user_notifications(username, is_read, created_at);

-- index for cleanup of old notifications
create index if not exists idx_user_notifications_created_at 
  on user_notifications(created_at);
