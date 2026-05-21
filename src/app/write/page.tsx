'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Image } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';

export default function WritePage() {
  const { language } = useAppStore();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [publishing, setPublishing] = useState(false);

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) return;
    setPublishing(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPublishing(false); return; }
    const { error } = await supabase.from('posts').insert({
      user_id: user.id, content: title, post_type: 'article',
      article_title: title, article_content: content, article_cover_url: coverUrl || null
    });
    if (!error) router.push('/feed');
    setPublishing(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="h-6 w-6 text-primary" />{language === 'es' ? 'Escribir Articulo' : 'Write Article'}</h1>
          <button onClick={handlePublish} disabled={publishing || !title.trim() || !content.trim()}
            className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors">
            {publishing ? '...' : (language === 'es' ? 'Publicar' : 'Publish')}
          </button>
        </div>
        <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder={language === 'es' ? 'URL de imagen de portada (opcional)' : 'Cover image URL (optional)'}
          className="w-full px-4 py-2 rounded-lg border border-border bg-card text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary/20" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={language === 'es' ? 'Titulo del articulo...' : 'Article title...'}
          className="w-full px-0 py-3 text-3xl font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted/40" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={language === 'es' ? 'Escribe tu articulo aqui...' : 'Write your article here...'}
          className="w-full px-0 py-3 text-base text-foreground bg-transparent border-none outline-none resize-none min-h-[400px] placeholder:text-muted/40 leading-relaxed" />
      </div>
    </div>
  );
}
