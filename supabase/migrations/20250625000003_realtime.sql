-- Enable Supabase Realtime on high-churn tables

ALTER PUBLICATION supabase_realtime ADD TABLE channel_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE community_members;
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
