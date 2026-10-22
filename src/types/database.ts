/**
 * Supabase Database types (generated from initial_schema migration).
 * Regenerate after schema changes: supabase gen types typescript --local
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          uid: string;
          username: string;
          email: string;
          display_name: string | null;
          photo_url: string | null;
          profile_image: string | null;
          bio: string | null;
          location: string | null;
          skills: string[] | null;
          github_url: string | null;
          experience_level: string | null;
          user_type: string | null;
          account_type: string | null;
          intent: string[] | null;
          interests: string[] | null;
          onboarding_step: number | null;
          onboarding_completed: boolean | null;
          total_sales: number | null;
          total_impressions: number | null;
          xp: number | null;
          badges: string[] | null;
          daily_gifting_remaining: number | null;
          last_gifting_reset: string | null;
          providers: string[] | null;
          role: string | null;
          settings: Json | null;
          theme: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['users']['Row']> & {
          id: string;
          uid: string;
          username: string;
          email: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      posts: {
        Row: {
          id: string;
          author_uid: string;
          author_name: string;
          author_photo: string | null;
          author_xp: number | null;
          community_id: string | null;
          content: string;
          code_snippet: string | null;
          language: string | null;
          media: Json | null;
          poll: Json | null;
          github_link: string | null;
          hashtags: string[] | null;
          visibility: string | null;
          likes_count: number | null;
          comments_count: number | null;
          reposts_count: number | null;
          impressions: number | null;
          xp_value: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['posts']['Row']> & {
          id: string;
          author_uid: string;
          content: string;
        };
        Update: Partial<Database['public']['Tables']['posts']['Row']>;
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          sender_id: string | null;
          sender_name: string | null;
          sender_photo: string | null;
          type: string;
          category: string | null;
          priority: string | null;
          content: string;
          related_id: string | null;
          channel_id: string | null;
          read: boolean | null;
          actors: Json | null;
          merged_count: number | null;
          created_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & {
          id: string;
          recipient_id: string;
          type: string;
          content: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
      };
      communities: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          creator_id: string;
          image_url: string | null;
          banner_url: string | null;
          visibility: string | null;
          member_count: number | null;
          stats: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['communities']['Row']> & {
          id: string;
          name: string;
          creator_id: string;
        };
        Update: Partial<Database['public']['Tables']['communities']['Row']>;
      };
      community_members: {
        Row: {
          community_id: string;
          user_id: string;
          role: string | null;
          permissions: Json | null;
          joined_at: string | null;
        };
        Insert: Database['public']['Tables']['community_members']['Row'];
        Update: Partial<Database['public']['Tables']['community_members']['Row']>;
      };
      hashtags: {
        Row: {
          id: string;
          tag: string;
          count: number | null;
          updated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['hashtags']['Row']> & { id: string; tag: string };
        Update: Partial<Database['public']['Tables']['hashtags']['Row']>;
      };
      articles: {
        Row: {
          id: string;
          author_uid: string;
          author_name: string | null;
          title: string;
          subtitle: string | null;
          cover_image: string | null;
          content: string;
          status: string | null;
          tags: string[] | null;
          reading_time: number | null;
          views_count: number | null;
          likes_count: number | null;
          created_at: string | null;
          updated_at: string | null;
          published_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['articles']['Row']> & {
          id: string;
          author_uid: string;
          title: string;
          content: string;
        };
        Update: Partial<Database['public']['Tables']['articles']['Row']>;
      };
      challenges: {
        Row: {
          id: string;
          creator_uid: string;
          title: string;
          description: string;
          difficulty: string | null;
          status: string | null;
          deadline: string | null;
          reward_xp: number | null;
          created_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['challenges']['Row']> & {
          id: string;
          creator_uid: string;
          title: string;
          description: string;
        };
        Update: Partial<Database['public']['Tables']['challenges']['Row']>;
      };
      events: {
        Row: {
          id: string;
          host_id: string;
          title: string;
          description: string | null;
          visibility: string | null;
          start_time: string | null;
          end_time: string | null;
          location: Json | null;
          created_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['events']['Row']> & {
          id: string;
          host_id: string;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['events']['Row']>;
      };
      products: {
        Row: {
          id: string;
          creator_uid: string;
          creator_name: string | null;
          title: string;
          slug: string | null;
          description: string | null;
          product_type: string | null;
          category: string | null;
          tags: string[] | null;
          price: number | null;
          created_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['products']['Row']> & {
          id: string;
          creator_uid: string;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['products']['Row']>;
      };
      jobs: {
        Row: {
          id: string;
          creator_uid: string;
          title: string;
          description: string | null;
          company: string | null;
          location: string | null;
          created_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['jobs']['Row']> & {
          id: string;
          creator_uid: string;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['jobs']['Row']>;
      };
      user_interests: {
        Row: {
          user_id: string;
          categories: string[] | null;
          skills: string[] | null;
          hashtags: string[] | null;
          followed_topics: string[] | null;
        };
        Insert: Database['public']['Tables']['user_interests']['Row'];
        Update: Partial<Database['public']['Tables']['user_interests']['Row']>;
      };
      user_engagement_profiles: {
        Row: {
          user_id: string;
          liked_tags: Json | null;
          bookmarked_tags: Json | null;
          purchased_categories: string[] | null;
          joined_communities: string[] | null;
          interaction_history: Json | null;
          seen_item_ids: string[] | null;
          updated_at: string | null;
        };
        Insert: Database['public']['Tables']['user_engagement_profiles']['Row'];
        Update: Partial<Database['public']['Tables']['user_engagement_profiles']['Row']>;
      };
      feed_preferences: {
        Row: {
          user_id: string;
          hidden_item_ids: string[] | null;
          muted_creator_ids: string[] | null;
          less_topics: string[] | null;
          updated_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['feed_preferences']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['feed_preferences']['Row']>;
      };
      user_blocked_users: {
        Row: {
          user_id: string;
          blocked_user_id: string;
          created_at: string | null;
        };
        Insert: Database['public']['Tables']['user_blocked_users']['Row'];
        Update: Partial<Database['public']['Tables']['user_blocked_users']['Row']>;
      };
      channel_messages: {
        Row: {
          id: string;
          channel_id: string;
          author_uid: string;
          author_name: string | null;
          author_photo: string | null;
          content: string;
          attachments: Json | null;
          reply_to_id: string | null;
          edited_at: string | null;
          created_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['channel_messages']['Row']> & {
          id: string;
          channel_id: string;
          author_uid: string;
          content: string;
        };
        Update: Partial<Database['public']['Tables']['channel_messages']['Row']>;
      };
      conversation_messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          read_by: string[] | null;
          created_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['conversation_messages']['Row']> & {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
        };
        Update: Partial<Database['public']['Tables']['conversation_messages']['Row']>;
      };
    };
    Functions: {
      gift_xp: {
        Args: { p_receiver_id: string; p_amount: number };
        Returns: Json;
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_community_admin: { Args: { p_community_id: string }; Returns: boolean };
    };
  };
}
