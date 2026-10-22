/**
 * Transform Firestore export JSONL → Supabase-ready JSONL.
 *
 * Usage:
 *   npx tsx scripts/firestore-to-postgres/transform-export.ts \
 *     [--input=./data/firestore-export] [--output=./data/transformed]
 */

import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';
import {
  firestoreUserToRow,
  firestorePostToRow,
  firestoreNotificationToRow,
  firestoreTimestampToIso,
} from '../../src/lib/db-mappers.js';

const inputArg = process.argv.find((a) => a.startsWith('--input='));
const outputArg = process.argv.find((a) => a.startsWith('--output='));
const inputDir = inputArg?.split('=')[1] || path.join(process.cwd(), 'data', 'firestore-export');
const outputDir = outputArg?.split('=')[1] || path.join(process.cwd(), 'data', 'transformed');

type Writer = { write: (row: Record<string, unknown>) => void; close: () => Promise<void> };

function createWriter(table: string): Writer {
  const filePath = path.join(outputDir, `${table}.jsonl`);
  const stream = fs.createWriteStream(filePath);
  return {
    write: (row) => stream.write(JSON.stringify(row) + '\n'),
    close: () => new Promise((resolve) => stream.end(resolve)),
  };
}

async function readJsonl(filePath: string, onLine: (obj: Record<string, unknown>) => void) {
  if (!(await fs.pathExists(filePath))) return;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) onLine(JSON.parse(line));
  }
}

async function main() {
  await fs.ensureDir(outputDir);

  const writers: Record<string, Writer> = {};
  const getWriter = (table: string) => {
    if (!writers[table]) writers[table] = createWriter(table);
    return writers[table];
  };

  const counts: Record<string, number> = {};

  // Users
  await readJsonl(path.join(inputDir, 'users.jsonl'), (line) => {
    if (line.parentCollection === 'users') {
      const parentId = line.parentId as string;
      const sub = line.subcollection as string;
      const id = line.id as string;

      if (sub === 'blockedUsers') {
        getWriter('user_blocked_users').write({ user_id: parentId, blocked_user_id: id });
        counts.user_blocked_users = (counts.user_blocked_users || 0) + 1;
      }
      return;
    }

    if (line.id && line.data) {
      getWriter('users').write(firestoreUserToRow(line.id as string, line.data as Record<string, unknown>));
      counts.users = (counts.users || 0) + 1;
    }
  });

  // Posts
  await readJsonl(path.join(inputDir, 'posts.jsonl'), (line) => {
    if (line.parentCollection === 'posts') {
      const postId = line.parentId as string;
      const sub = line.subcollection as string;
      const id = line.id as string;
      const data = line.data as Record<string, unknown>;

      if (sub === 'comments') {
        getWriter('post_comments').write({
          id,
          post_id: postId,
          author_uid: data.authorUid,
          author_name: data.authorName || '',
          author_photo: data.authorPhoto || '',
          content: data.content,
          likes_count: data.likesCount ?? 0,
          replies_count: data.repliesCount ?? 0,
          reply_to_id: data.replyToId || null,
          created_at: firestoreTimestampToIso(data.createdAt),
        });
        counts.post_comments = (counts.post_comments || 0) + 1;
      } else if (sub === 'likes') {
        getWriter('post_likes').write({
          post_id: postId,
          user_id: id,
          created_at: firestoreTimestampToIso(data.createdAt) || new Date().toISOString(),
        });
        counts.post_likes = (counts.post_likes || 0) + 1;
      }
      return;
    }

    if (line.id && line.data) {
      getWriter('posts').write(firestorePostToRow(line.id as string, line.data as Record<string, unknown>));
      counts.posts = (counts.posts || 0) + 1;
    }
  });

  // Communities
  await readJsonl(path.join(inputDir, 'communities.jsonl'), (line) => {
    if (line.parentCollection === 'communities') {
      const communityId = line.parentId as string;
      const sub = line.subcollection as string;
      const id = line.id as string;
      const data = line.data as Record<string, unknown>;

      if (sub === 'members') {
        getWriter('community_members').write({
          community_id: communityId,
          user_id: (data.userId as string) || id,
          role: data.role || 'member',
          permissions: data.permissions || {},
          joined_at: firestoreTimestampToIso(data.joinedAt) || new Date().toISOString(),
        });
        counts.community_members = (counts.community_members || 0) + 1;
      } else if (sub === 'channels') {
        getWriter('channels').write({
          id,
          community_id: communityId,
          category_id: data.categoryId || null,
          name: data.name,
          description: data.description || '',
          type: data.type || 'text',
          created_at: firestoreTimestampToIso(data.createdAt),
        });
        counts.channels = (counts.channels || 0) + 1;
      } else if (typeof sub === 'string' && sub.includes('/messages')) {
        const channelId = sub.split('/')[1];
        getWriter('channel_messages').write({
          id,
          channel_id: channelId,
          author_uid: data.authorUid,
          author_name: data.authorName || '',
          author_photo: data.authorPhoto || '',
          content: data.content,
          attachments: data.attachments || [],
          reply_to_id: data.replyToId || null,
          created_at: firestoreTimestampToIso(data.createdAt),
        });
        counts.channel_messages = (counts.channel_messages || 0) + 1;
      }
      return;
    }

    if (line.id && line.data) {
      const data = line.data as Record<string, unknown>;
      getWriter('communities').write({
        id: line.id,
        name: data.name,
        description: data.description || '',
        creator_id: data.creatorId,
        image_url: data.imageUrl || data.image || null,
        banner_url: data.bannerUrl || data.banner || null,
        visibility: data.visibility || 'public',
        member_count: data.memberCount ?? 0,
        stats: data.stats || {},
        created_at: firestoreTimestampToIso(data.createdAt),
        updated_at: firestoreTimestampToIso(data.updatedAt),
      });
      counts.communities = (counts.communities || 0) + 1;
    }
  });

  // Notifications
  await readJsonl(path.join(inputDir, 'notifications.jsonl'), (line) => {
    if (line.id && line.data) {
      getWriter('notifications').write(
        firestoreNotificationToRow(line.id as string, line.data as Record<string, unknown>)
      );
      counts.notifications = (counts.notifications || 0) + 1;
    }
  });

  // Hashtags
  await readJsonl(path.join(inputDir, 'hashtags.jsonl'), (line) => {
    if (line.id && line.data) {
      const data = line.data as Record<string, unknown>;
      getWriter('hashtags').write({
        id: line.id,
        tag: data.tag || line.id,
        count: data.count ?? 0,
        updated_at: firestoreTimestampToIso(data.updatedAt),
      });
      counts.hashtags = (counts.hashtags || 0) + 1;
    }
  });

  // User interests / engagement
  await readJsonl(path.join(inputDir, 'userInterests.jsonl'), (line) => {
    if (line.id && line.data) {
      const data = line.data as Record<string, unknown>;
      getWriter('user_interests').write({
        user_id: line.id,
        categories: data.categories || [],
        skills: data.skills || [],
        hashtags: data.hashtags || [],
        followed_topics: data.followedTopics || [],
      });
      counts.user_interests = (counts.user_interests || 0) + 1;
    }
  });

  await readJsonl(path.join(inputDir, 'userEngagementProfiles.jsonl'), (line) => {
    if (line.id && line.data) {
      const data = line.data as Record<string, unknown>;
      getWriter('user_engagement_profiles').write({
        user_id: line.id,
        liked_tags: data.likedTags || {},
        bookmarked_tags: data.bookmarkedTags || {},
        purchased_categories: data.purchasedCategories || [],
        joined_communities: data.joinedCommunities || [],
        interaction_history: data.interactionHistory || [],
      });
      counts.user_engagement_profiles = (counts.user_engagement_profiles || 0) + 1;
    }
  });

  // Conversations
  await readJsonl(path.join(inputDir, 'conversations.jsonl'), (line) => {
    if (line.parentCollection === 'conversations' && line.subcollection === 'messages') {
      const data = line.data as Record<string, unknown>;
      getWriter('conversation_messages').write({
        id: line.id,
        conversation_id: line.parentId,
        sender_id: data.senderId,
        content: data.content,
        read_by: data.readBy || [],
        created_at: firestoreTimestampToIso(data.createdAt),
      });
      counts.conversation_messages = (counts.conversation_messages || 0) + 1;
      return;
    }

    if (line.id && line.data) {
      const data = line.data as Record<string, unknown>;
      getWriter('conversations').write({
        id: line.id,
        participant_ids: data.participantIds || data.participants || [],
        last_message: data.lastMessage || null,
        last_message_at: firestoreTimestampToIso(data.lastMessageAt),
        created_at: firestoreTimestampToIso(data.createdAt),
      });
      counts.conversations = (counts.conversations || 0) + 1;
    }
  });

  // Generic content collections
  const genericMappers: Record<string, (id: string, data: Record<string, unknown>) => Record<string, unknown>> = {
    articles: (id, data) => ({
      id,
      author_uid: data.authorUid,
      author_name: data.authorName || '',
      title: data.title,
      subtitle: data.subtitle || '',
      cover_image: data.coverImage || null,
      content: data.content,
      status: data.status || 'draft',
      tags: data.tags || [],
      reading_time: data.readingTime ?? 0,
      views_count: data.viewsCount ?? 0,
      likes_count: data.likesCount ?? 0,
      created_at: firestoreTimestampToIso(data.createdAt),
      updated_at: firestoreTimestampToIso(data.updatedAt),
      published_at: firestoreTimestampToIso(data.publishedAt),
    }),
    challenges: (id, data) => ({
      id,
      creator_uid: data.creatorUid,
      title: data.title,
      description: data.description,
      difficulty: data.difficulty || null,
      status: data.status || 'active',
      deadline: firestoreTimestampToIso(data.deadline),
      reward_xp: data.rewardXP ?? 0,
      created_at: firestoreTimestampToIso(data.createdAt),
    }),
    events: (id, data) => ({
      id,
      host_id: data.hostId || data.creatorUid,
      title: data.title,
      description: data.description || '',
      visibility: data.visibility || 'public',
      start_time: firestoreTimestampToIso(data.startTime || data.startDate),
      end_time: firestoreTimestampToIso(data.endTime || data.endDate),
      location: data.location || null,
      created_at: firestoreTimestampToIso(data.createdAt),
    }),
    products: (id, data) => ({
      id,
      creator_uid: data.creatorUid,
      creator_name: data.creatorName || '',
      title: data.title,
      slug: data.slug || null,
      description: data.description || '',
      product_type: data.productType || null,
      category: data.category || null,
      tags: data.tags || [],
      price: data.price ?? 0,
      created_at: firestoreTimestampToIso(data.createdAt),
    }),
    jobs: (id, data) => ({
      id,
      creator_uid: data.creatorUid || data.authorUid,
      title: data.title,
      description: data.description || '',
      company: data.company || '',
      location: data.location || '',
      created_at: firestoreTimestampToIso(data.createdAt),
    }),
    xpTransactions: (id, data) => ({
      id,
      sender_id: data.senderId,
      receiver_id: data.receiverId,
      amount: data.amount,
      timestamp: firestoreTimestampToIso(data.timestamp),
    }),
    purchases: (id, data) => ({
      id,
      buyer_id: data.buyerId || data.userId,
      product_id: data.productId || null,
      amount: data.amount ?? 0,
      stripe_session_id: data.stripeSessionId || null,
      status: data.status || 'completed',
      created_at: firestoreTimestampToIso(data.createdAt),
    }),
  };

  const fileToTable: Record<string, string> = {
    articles: 'articles',
    challenges: 'challenges',
    events: 'events',
    products: 'products',
    jobs: 'jobs',
    xpTransactions: 'xp_transactions',
    purchases: 'purchases',
  };

  for (const [file, table] of Object.entries(fileToTable)) {
    const mapper = genericMappers[file];
    await readJsonl(path.join(inputDir, `${file}.jsonl`), (line) => {
      if (line.id && line.data && mapper) {
        getWriter(table).write(mapper(line.id as string, line.data as Record<string, unknown>));
        counts[table] = (counts[table] || 0) + 1;
      }
    });
  }

  await Promise.all(Object.values(writers).map((w) => w.close()));

  await fs.writeJson(path.join(outputDir, '_transform_summary.json'), {
    transformedAt: new Date().toISOString(),
    inputDir,
    counts,
  });

  console.log('Transform complete:', counts);
}

main().catch((err) => {
  console.error('Transform failed:', err);
  process.exit(1);
});
