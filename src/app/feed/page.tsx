import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getMyProfile } from '@/app/actions/profile';
import { PostComposer } from '@/components/feed/PostComposer';
import { FeedList } from '@/components/feed/FeedList';

export default async function FeedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/feed');

  const profile = await getMyProfile();
  if (!profile) redirect('/profile/edit');

  const currentUser = {
    user_id: profile.user_id,
    username: profile.username,
    full_name: profile.full_name,
    headline: profile.headline,
    avatar_url: profile.avatar_url,
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <PostComposer currentUser={currentUser} />
      <FeedList currentUser={currentUser} />
    </main>
  );
}
