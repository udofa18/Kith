/**
 * Field mapping between Firestore (camelCase) and Postgres (snake_case).
 */

export function firestoreTimestampToIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    const v = value as { _seconds?: number; seconds?: number; toDate?: () => Date };
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    const sec = v._seconds ?? v.seconds;
    if (typeof sec === 'number') return new Date(sec * 1000).toISOString();
  }
  return null;
}

export function firestoreUserToRow(id: string, data: Record<string, unknown>) {
  return {
    id,
    uid: (data.uid as string) || id,
    username: data.username as string,
    email: (data.email as string) || '',
    display_name: (data.displayName as string) || null,
    photo_url: (data.photoURL as string) || null,
    profile_image: (data.profileImage as string) || null,
    bio: (data.bio as string) || '',
    location: (data.location as string) || '',
    skills: (data.skills as string[]) || [],
    github_url: (data.githubUrl as string) || '',
    experience_level: (data.experienceLevel as string) || null,
    user_type: (data.userType as string) || null,
    account_type: (data.accountType as string) || 'personal',
    intent: (data.intent as string[]) || [],
    interests: (data.interests as string[]) || [],
    onboarding_step: (data.onboardingStep as number) ?? 0,
    onboarding_completed: (data.onboardingCompleted as boolean) ?? false,
    total_sales: (data.totalSales as number) ?? 0,
    total_impressions: (data.totalImpressions as number) ?? 0,
    xp: (data.xp as number) ?? 100,
    badges: (data.badges as string[]) || [],
    daily_gifting_remaining: (data.dailyGiftingRemaining as number) ?? 100,
    last_gifting_reset: firestoreTimestampToIso(data.lastGiftingReset) || new Date().toISOString(),
    providers: (data.providers as string[]) || [],
    role: (data.role as string) || 'user',
    settings: data.settings || {},
    theme: (data.theme as string) || null,
    created_at: firestoreTimestampToIso(data.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function firestorePostToRow(id: string, data: Record<string, unknown>) {
  return {
    id,
    author_uid: data.authorUid as string,
    author_name: (data.authorName as string) || '',
    author_photo: (data.authorPhoto as string) || '',
    author_xp: (data.authorXp as number) ?? 0,
    community_id: (data.communityId as string) || null,
    content: data.content as string,
    code_snippet: (data.codeSnippet as string) || null,
    language: (data.language as string) || null,
    media: data.media || [],
    poll: data.poll || null,
    github_link: (data.githubLink as string) || null,
    hashtags: (data.hashtags as string[]) || [],
    visibility: (data.visibility as string) || 'public',
    likes_count: (data.likesCount as number) ?? 0,
    comments_count: (data.commentsCount as number) ?? 0,
    reposts_count: (data.repostsCount as number) ?? 0,
    impressions: (data.impressions as number) ?? 0,
    xp_value: (data.xpValue as number) ?? 0,
    created_at: firestoreTimestampToIso(data.createdAt) || new Date().toISOString(),
    updated_at: firestoreTimestampToIso(data.updatedAt) || new Date().toISOString(),
  };
}

export function firestoreNotificationToRow(id: string, data: Record<string, unknown>) {
  return {
    id,
    recipient_id: data.recipientId as string,
    sender_id: (data.senderId as string) || null,
    sender_name: (data.senderName as string) || '',
    sender_photo: (data.senderPhoto as string) || '',
    type: data.type as string,
    category: (data.category as string) || 'social',
    priority: (data.priority as string) || 'normal',
    content: data.content as string,
    related_id: (data.relatedId as string) || null,
    channel_id: (data.channelId as string) || null,
    read: (data.read as boolean) ?? false,
    actors: data.actors || [],
    merged_count: (data.mergedCount as number) ?? 1,
    created_at: firestoreTimestampToIso(data.createdAt) || new Date().toISOString(),
  };
}

export function supabaseUserToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    uid: row.id ?? row.uid,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    photoURL: row.photo_url || row.profile_image,
    profileImage: row.profile_image,
    bio: row.bio,
    location: row.location,
    skills: row.skills,
    githubUrl: row.github_url,
    experienceLevel: row.experience_level,
    userType: row.user_type,
    accountType: row.account_type,
    intent: row.intent,
    interests: row.interests,
    onboardingStep: row.onboarding_step,
    onboardingCompleted: row.onboarding_completed,
    totalSales: row.total_sales,
    totalImpressions: row.total_impressions,
    xp: row.xp,
    badges: row.badges,
    dailyGiftingRemaining: row.daily_gifting_remaining,
    lastGiftingReset: row.last_gifting_reset,
    providers: row.providers,
    role: row.role,
    settings: row.settings,
    theme: row.theme,
    createdAt: row.created_at,
  };
}

export function supabasePostToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    authorUid: row.author_uid,
    authorName: row.author_name,
    authorPhoto: row.author_photo,
    authorXp: row.author_xp,
    communityId: row.community_id,
    content: row.content,
    codeSnippet: row.code_snippet,
    language: row.language,
    media: row.media,
    poll: row.poll,
    githubLink: row.github_link,
    hashtags: row.hashtags,
    visibility: row.visibility,
    likesCount: row.likes_count,
    commentsCount: row.comments_count,
    repostsCount: row.reposts_count,
    impressions: row.impressions,
    xpValue: row.xp_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function supabaseNotificationToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderPhoto: row.sender_photo,
    type: row.type,
    category: row.category,
    priority: row.priority,
    content: row.content,
    relatedId: row.related_id,
    channelId: row.channel_id,
    read: row.read,
    actors: row.actors,
    mergedCount: row.merged_count,
    createdAt: row.created_at,
  };
}

export function camelToSnakeField(field: string): string {
  return field.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
}
