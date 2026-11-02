/**
 * Small shared helpers for showing a person consistently across the app.
 */

export const avatarFor = (user: any) =>
  user?.profileImage && String(user.profileImage).trim() !== ''
    ? user.profileImage
    : user?.photoURL && String(user.photoURL).trim() !== ''
      ? user.photoURL
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid || 'kith'}`;

export const levelFor = (xp: number) => Math.floor(xp / 100) + 1;
