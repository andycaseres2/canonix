import type { Profile } from '../../lib/types';

/** Per-user progress totals from the `admin_user_stats` RPC. */
export type UserStats = { user_id: string; units_done: number | null; last_activity: string | null };

/** One row of the users table: the profile plus what the admin view needs to know about it. */
export type UserRowData = { profile: Profile; stats?: UserStats; isSelf: boolean; banned: boolean };
