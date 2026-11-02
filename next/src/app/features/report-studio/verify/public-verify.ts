import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { API_BASE } from '../../../core/api/api.config';

/** What media's public lookup answers (reportVerify.json/lookup): never a report's contents. */
export interface VerifyAnswer {
  state: 'GENUINE' | 'NOT_APPROVED' | 'REPLACED' | 'VOID' | 'NOT_FOUND';
  issuer?: string; document?: string; label?: string; version?: number; versions?: number; issuedAt?: string; zone?: string;
  pages?: number | null; signed?: boolean; voidedAt?: string | null; newer?: { version: number; issuedAt?: string | null } | null;
  signers?: { name?: string | null; title?: string | null; meaning?: string | null; at?: string | null }[];
  fingerprints?: string[];
}

/** The headline and the sentence under it, per state. */
export function verdict(a: VerifyAnswer): { title: string; text: string; tone: 'ok' | 'warn' | 'crit' | 'neutral'; icon: string } {
  const issuer = a.issuer ?? 'The issuer';
  switch (a.state) {
    case 'GENUINE': return { tone: 'ok', icon: 'shield', title: 'This report is genuine and current',
      text: `${issuer} issued it and approved it${a.signed ? ', it carries a digital signature' : ''}, and no newer version replaces it.` };
    case 'NOT_APPROVED': return { tone: 'warn', icon: 'clock', title: 'Genuine, but not approved yet',
      text: `${issuer} issued this version; nobody has approved or signed it yet. Do not rely on it as a final report.` };
    case 'REPLACED': return { tone: 'warn', icon: 'history', title: 'A newer version exists',
      text: `Genuine, but version ${a.newer?.version ?? ''}${a.newer?.issuedAt ? ' (' + a.newer.issuedAt + ')' : ''} replaces it. Ask the sender for the current copy.` };
    case 'VOID': return { tone: 'crit', icon: 'xCircle', title: 'This version was voided',
      text: `${issuer} withdrew it${a.voidedAt ? ' on ' + a.voidedAt : ''}. Do not rely on it.` };
    default: return { tone: 'neutral', icon: 'search', title: 'Not found',
      text: 'No report has this code. Check the code you typed, or contact whoever sent you the report.' };
  }
}

/** SHA-256 of bytes, as lower-case hex (the fingerprints are written so). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** A fingerprint as people read it: groups of four, the middle left out. */
export function shortPrint(sha: string): string {
  const g = (s: string) => s.match(/.{1,4}/g)!.join(' ');
  return `SHA-256 ${g(sha.slice(0, 16))} … ${g(sha.slice(-8))}`;
}

/** A code as typed: the console's own format, XXXXX-XXXXX, else null. */
export function codeOf(typed: string): string | null {
  const t = typed.trim().toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(t) ? `${t.slice(0, 5)}-${t.slice(5)}` : null;
}

/**
 * The public verify page (reports redesign, owner 2026-11-02, feature 1; design verify.html): what a report's QR code opens,
 * for anyone -- a GP, a payer, the patient -- with no sign-in. It says whether that copy is genuine and current, replaced,
 * void or not approved, who issued and approved it, and checks a PDF the reader holds against the signed one: the file is
 * hashed in this browser and compared with the fingerprints, never uploaded. No patient data is ever shown. The call goes
 * without the console's session (a plain fetch), so it is the same answer signed in or not.
 */
@Component({
  selector: 'app-public-verify',
  imports: [Icon, RouterLink],
  styleUrl: './public-verify.css',
  template: `
    <div class="pv">
      <header class="pv-top">
        <span class="pv-issuer"><app-icon name="shield" />{{ answer()?.issuer ?? 'Report verification' }}</span>
        <span class="pv-checked">Checked {{ checkedAt() }}</span>
      </header>
      <div class="pv-grid">
        <main class="pv-card" aria-live="polite">
          @if (loading()) {
            <div class="pv-head"><div class="spinner" role="status" aria-label="Checking"></div><div><h1>Checking the report…</h1></div></div>
          } @else if (error()) {
            <div class="pv-head"><span class="pv-ico pv-neutral"><app-icon name="alert" size="1.5rem" /></span>
              <div><h1>The check could not be made</h1><p>{{ error() }}</p>
                <button type="button" class="btn btn-default btn-sm" (click)="load()"><app-icon name="refresh" />Try again</button></div></div>
          } @else if (answer(); as a) {
            @let v = verdict(a);
            <div class="pv-head"><span class="pv-ico" [class]="'pv-ico pv-' + v.tone"><app-icon [name]="$any(v.icon)" size="1.5rem" /></span>
              <div><h1 data-test="verdict">{{ v.title }}</h1><p>{{ v.text }}</p></div></div>
            @if (a.state !== 'NOT_FOUND') {
              <dl class="pv-facts">
                <dt>Document</dt><dd>{{ a.document }}</dd>
                <dt>Report number</dt><dd class="mono">{{ a.label }} · version {{ a.version }} of {{ a.versions }}</dd>
                <dt>Issued</dt><dd>{{ a.issuedAt }} ({{ city(a.zone) }})</dd>
                @if (a.signers?.length) {
                  <dt>{{ a.signed ? 'Signed by' : 'Approved by' }}</dt>
                  <dd>@for (s of a.signers!; track $index) { <span class="block">{{ s.name }}{{ s.title ? ', ' + s.title : '' }} · {{ s.at }}@if (s.meaning) { · {{ s.meaning }} }</span> }</dd>
                }
                @if (a.pages) { <dt>Pages</dt><dd>{{ a.pages }}</dd> }
                @if (a.fingerprints?.length) { <dt>Fingerprint</dt><dd class="mono text-xs">{{ shortPrint(a.fingerprints![0]) }}</dd> }
              </dl>
              <label class="pv-drop" [class.is-over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)"
                     (drop)="$event.preventDefault(); over.set(false); pick($any($event).dataTransfer?.files?.[0])">
                <app-icon name="upload" />
                <span class="pv-drop-text"><b>Check your copy</b><span>Drop the PDF you were given, or choose it: it is checked in this browser against the
                  fingerprints and never uploaded.</span></span>
                <span class="btn btn-default btn-sm">Choose PDF…</span>
                <input type="file" class="sr-only" accept="application/pdf,.pdf,text/html,.html" (change)="pick($any($event.target).files?.[0])" />
              </label>
              @if (copy(); as c) {
                <p class="pv-copy" [class.is-ok]="c.match" role="status" data-test="copy-check">
                  <app-icon [name]="c.match ? 'checkCircle' : 'alert'" />
                  @if (c.match) { {{ c.name }} is exactly the file {{ a.issuer }} issued@if (a.state !== 'GENUINE') {, but read the answer above}. }
                  @else { {{ c.name }} does not match. It differs from what was issued and may have been changed. A copy marked COPY or VOID
                    when it was downloaded differs too: ask the sender for the original. }
                </p>
              }
            } @else {
              <form class="pv-retry" (submit)="$event.preventDefault(); retype()">
                <label for="pv-code">Type the code under the QR code</label>
                <input id="pv-code" class="input mono" placeholder="XXXXX-XXXXX" [value]="typed()" (input)="typed.set($any($event.target).value)" />
                <button type="submit" class="btn btn-default btn-sm" [disabled]="!codeOf(typed())">Check</button>
              </form>
            }
            <footer class="pv-foot"><span>No patient information is shown on this page.</span>
              <a class="link-inline" routerLink="/login">Work at {{ a.issuer ?? 'the issuer' }}? Sign in to open the report</a></footer>
          }
        </main>
        <aside class="pv-card pv-legend" aria-label="What a scan can answer">
          <h2>What a scan can answer</h2>
          <ul>
            <li><span class="pv-ico pv-ok"><app-icon name="shield" /></span><div><b>Genuine and current</b><span>Issued, approved, and no newer version.</span></div></li>
            <li><span class="pv-ico pv-warn"><app-icon name="history" /></span><div><b>A newer version exists</b><span>Genuine, but replaced: ask for the current copy.</span></div></li>
            <li><span class="pv-ico pv-crit"><app-icon name="xCircle" /></span><div><b>Voided</b><span>Withdrawn by the issuer. Do not rely on it.</span></div></li>
            <li><span class="pv-ico pv-warn"><app-icon name="clock" /></span><div><b>Not approved yet</b><span>Genuine, but nobody has signed it.</span></div></li>
            <li><span class="pv-ico pv-crit"><app-icon name="alert" /></span><div><b>Your copy does not match</b><span>The file you checked differs from what was issued.</span></div></li>
            <li><span class="pv-ico pv-neutral"><app-icon name="search" /></span><div><b>Not found</b><span>No report has this code.</span></div></li>
          </ul>
        </aside>
      </div>
    </div>
  `,
})
export class PublicVerify implements OnInit {
  readonly code = input.required<string>();
  private readonly router = inject(Router);
  readonly answer = signal<VerifyAnswer | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly over = signal(false);
  readonly typed = signal('');
  readonly copy = signal<{ name: string; match: boolean } | null>(null);
  readonly checkedAt = signal('');
  readonly verdict = verdict;
  readonly shortPrint = shortPrint;
  readonly codeOf = codeOf;
  readonly prints = computed(() => new Set(this.answer()?.fingerprints ?? []));

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.copy.set(null);
    try {
      // No session on purpose: the answer is the public one, the same for everyone.
      const res = await fetch(`${API_BASE}/reportVerify.json/lookup?code=${encodeURIComponent(this.code())}`, { credentials: 'omit', cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.status === 429) throw new Error('Too many checks from this network just now; try again in a minute.');
      if (!res.ok || !body?.data) throw new Error(body?.message || 'The verification service did not answer; try again.');
      this.answer.set(body.data as VerifyAnswer);
      this.checkedAt.set(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23' }).format(new Date()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'The check could not be made.');
    } finally {
      this.loading.set(false);
    }
  }

  async pick(file: File | null | undefined): Promise<void> {
    if (!file) return;
    const sha = await sha256Hex(await file.arrayBuffer());
    this.copy.set({ name: file.name, match: this.prints().has(sha) });
  }

  retype(): void {
    const c = codeOf(this.typed());
    if (c) void this.router.navigate(['/r', c]).then(() => this.load());
  }

  /** The zone's city, as the console writes times ("Chicago"). */
  city(zone: string | undefined): string {
    return (zone ?? 'America/Chicago').split('/').pop()!.replace(/_/g, ' ');
  }
}
