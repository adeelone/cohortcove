import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/env";
import { hasFeature, planForFeature } from "@/lib/plans";
import { requireAdmin } from "@/server/guards";
import {
  addCampusAction,
  addCategoryAction,
  addDomainAction,
  addVenueAction,
  removeCategoryAction,
  removeDomainAction,
  toggleVenueSensitiveAction,
  updateSettingsAction,
} from "../actions";
import { SettingsForm } from "./settings-form";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const membership = await requireAdmin();
  const params = await searchParams;
  const institution = membership.institution;
  const sub = institution.subscription;

  const [domains, categories, campuses, venues] = await Promise.all([
    prisma.allowedDomain.findMany({ where: { institutionId: institution.id }, orderBy: { domain: "asc" } }),
    prisma.category.findMany({
      where: { institutionId: institution.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { eventSeries: true, organizations: true } } },
    }),
    prisma.campus.findMany({ where: { institutionId: institution.id }, orderBy: { name: "asc" } }),
    prisma.venue.findMany({ where: { institutionId: institution.id }, orderBy: { name: "asc" }, include: { campus: true } }),
  ]);
  const publicUrl = `${appUrl()}/c/${institution.slug}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Campus policy, domains, categories and places. Every change is recorded in the audit log." />
      {params.ok && <Alert tone="success">{params.ok}</Alert>}
      {params.error && <Alert tone="danger">{params.error}</Alert>}

      <Card as="section">
        <CardHeader title="General" />
        <div className="p-5">
          <SettingsForm
            action={updateSettingsAction}
            initial={{
              name: institution.name,
              tagline: institution.tagline,
              timeZone: institution.timeZone,
              accentColor: institution.accentColor,
              publicCalendarEnabled: institution.publicCalendarEnabled,
            }}
            canBrand={hasFeature(sub, "branding")}
            canPublic={hasFeature(sub, "publicCalendar")}
            upgradeLabel={`${planForFeature("branding").name} plan`}
            publicUrl={publicUrl}
          />
          {institution.publicCalendarEnabled && hasFeature(sub, "publicCalendar") && (
            <p className="mt-3 text-sm">
              <Link href={`/c/${institution.slug}`} className="link">Open your public calendar →</Link>
            </p>
          )}
        </div>
      </Card>

      <Card as="section" id="domains" className="scroll-mt-24">
        <CardHeader title="Email domains" description="Anyone with a verified address on these domains can join. The domain sets their starting role." />
        <ul className="divide-y divide-cove-border">
          {domains.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <code>{d.domain}</code> <Badge>{d.role === "STAFF_SPONSOR" ? "joins as staff sponsor" : d.role === "CAMPUS_MODERATOR" ? "joins as moderator" : "joins as student"}</Badge>
              </span>
              {domains.length > 1 && (
                <form action={removeDomainAction}>
                  <input type="hidden" name="domainId" value={d.id} />
                  <SubmitButton variant="ghost" size="sm" confirm={`Remove ${d.domain}? Existing members keep access; new sign-ups from it will stop.`}>Remove</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form action={addDomainAction} className="flex flex-col gap-3 border-t border-cove-border p-5 sm:flex-row sm:items-end">
          <Field label="Add domain" htmlFor="domain" className="flex-1">
            <Input id="domain" required placeholder="alumni.yourcampus.edu" />
          </Field>
          <Field label="Joins as" htmlFor="domain-role">
            <Select id="domain-role" name="role" defaultValue="STUDENT">
              <option value="STUDENT">Student</option>
              <option value="STAFF_SPONSOR">Staff sponsor</option>
              <option value="CAMPUS_MODERATOR">Moderator</option>
            </Select>
          </Field>
          <SubmitButton variant="secondary">Add</SubmitButton>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" id="categories" className="scroll-mt-24">
          <CardHeader title="Categories" description="Used for filters and personalized recommendations." />
          <ul className="flex flex-wrap gap-2 p-5">
            {categories.map((cat) => {
              const inUse = cat._count.eventSeries + cat._count.organizations > 0;
              return (
                <li key={cat.id} className="flex items-center gap-1 rounded-full border border-cove-border py-1 pl-3 pr-1 text-sm">
                  {cat.name}
                  {!inUse && (
                    <form action={removeCategoryAction}>
                      <input type="hidden" name="categoryId" value={cat.id} />
                      <button type="submit" className="rounded-full px-1.5 text-cove-muted hover:bg-cove-sunken" aria-label={`Remove ${cat.name}`}>×</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <form action={addCategoryAction} className="flex items-end gap-2 border-t border-cove-border p-5">
            <Field label="New category" htmlFor="cat-name" className="flex-1">
              <Input id="cat-name" name="name" required maxLength={60} />
            </Field>
            <SubmitButton variant="secondary">Add</SubmitButton>
          </form>
        </Card>

        <Card as="section" id="venues" className="scroll-mt-24">
          <CardHeader title="Campuses & venues" description="Private venues only reveal their name to attendees and organizers." />
          <ul className="divide-y divide-cove-border text-sm">
            {venues.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span>
                  {v.name} {v.campus && <span className="text-cove-muted">· {v.campus.name}</span>} {v.isSensitive && <Badge tone="warning">Private location</Badge>}
                </span>
                <form action={toggleVenueSensitiveAction}>
                  <input type="hidden" name="venueId" value={v.id} />
                  <input type="hidden" name="isSensitive" value={v.isSensitive ? "0" : "1"} />
                  <SubmitButton variant="ghost" size="sm">{v.isSensitive ? "Make public" : "Make private"}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={addVenueAction} className="grid gap-3 border-t border-cove-border p-5 sm:grid-cols-2">
            <Field label="Venue name" htmlFor="venue-name">
              <Input id="venue-name" name="name" required maxLength={120} />
            </Field>
            <Field label="Campus" htmlFor="venue-campus">
              <Select id="venue-campus" name="campusId">
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Address (optional)" htmlFor="venue-address" className="sm:col-span-2">
              <Input id="venue-address" name="address" maxLength={200} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isSensitive" className="h-4 w-4" /> Private location
            </label>
            <SubmitButton variant="secondary" className="justify-self-end">Add venue</SubmitButton>
          </form>
          <form action={addCampusAction} className="flex items-end gap-2 border-t border-cove-border p-5">
            <Field label={<>New campus {!hasFeature(sub, "multiCampus") && <Badge tone="accent">{planForFeature("multiCampus").name} plan</Badge>}</>} htmlFor="campus-name" className="flex-1">
              <Input id="campus-name" name="name" required maxLength={80} />
            </Field>
            <SubmitButton variant="secondary">Add campus</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
