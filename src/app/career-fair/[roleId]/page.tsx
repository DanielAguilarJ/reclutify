import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getJobById } from '@/app/actions/jobs';
import JobDetailPage from './JobDetailPage';

interface PageProps {
  params: Promise<{ roleId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { roleId } = await params;
  const job = await getJobById(roleId);

  if (!job) {
    return { title: 'Vacante no encontrada | Reclutify' };
  }

  const orgName = job.organizations?.name || 'Empresa';

  return {
    title: `${job.title} en ${orgName} | Reclutify`,
    description: job.description
      ? job.description.slice(0, 160)
      : `Aplica a ${job.title} en ${orgName}. Entrevista con IA en Reclutify.`,
    alternates: { canonical: `/career-fair/${roleId}` },
    openGraph: {
      title: `${job.title} — ${orgName}`,
      description: job.description?.slice(0, 200) || `Vacante en ${orgName}`,
      type: 'website',
      siteName: 'Reclutify',
      url: `https://www.reclutify.com/career-fair/${roleId}`,
      images: [{
        url: `/api/og?title=${encodeURIComponent(job.title)}&subtitle=${encodeURIComponent(orgName)}&type=job`,
        width: 1200,
        height: 630,
        alt: `${job.title} en ${orgName}`,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${job.title} — ${orgName}`,
      description: job.description?.slice(0, 200) || `Vacante en ${orgName}`,
      images: [`/api/og?title=${encodeURIComponent(job.title)}&subtitle=${encodeURIComponent(orgName)}&type=job`],
    },
  };
}

export default async function RoleDetailPage({ params }: PageProps) {
  const { roleId } = await params;
  const job = await getJobById(roleId);

  if (!job) {
    notFound();
  }

  const orgName = job.organizations?.name || 'Empresa';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.reclutify.com';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description || '',
    datePosted: job.published_at,
    hiringOrganization: {
      '@type': 'Organization',
      name: orgName,
      logo: job.organizations?.logo_url || undefined,
    },
    jobLocation: job.location
      ? {
          '@type': 'Place',
          address: { '@type': 'PostalAddress', addressLocality: job.location },
        }
      : undefined,
    employmentType: job.job_type || undefined,
    url: `${baseUrl}/career-fair/${job.id}`,
    validThrough: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    baseSalary: job.salary ? {
      '@type': 'MonetaryAmount',
      currency: 'USD',
      value: { '@type': 'QuantitativeValue', value: job.salary },
    } : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <JobDetailPage job={job} />
    </>
  );
}
