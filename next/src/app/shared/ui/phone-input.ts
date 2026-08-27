import { Component, computed, effect, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AsYouType, CountryCode, getCountries, getCountryCallingCode, parsePhoneNumberFromString,
} from 'libphonenumber-js';

/**
 * A country picker and a number box that together produce one E.164 string.
 *
 * Validation is libphonenumber's, the same metadata the server checks against, so the two
 * cannot disagree about whether a number exists. A length rule would pass +1 000 123 4567 --
 * ten digits, right shape, no such area code -- and the person would only find out when
 * somebody tried to ring it.
 *
 * The value in and out is E.164 (+923001234567). The country is derived from it on the way in
 * rather than stored separately, so there is nothing to drift out of step with the number.
 */
@Component({
  selector: 'app-phone-input',
  imports: [FormsModule],
  template: `
    <div class="flex gap-2">
      <select class="input max-w-44 shrink-0" [ngModel]="country()" name="phoneCountry"
              [ngModelOptions]="{standalone: true}"
              (ngModelChange)="onCountryChange($event)"
              [attr.aria-label]="'Country dialling code'">
        @for (c of countries; track c.code) {
          <option [value]="c.code">{{ c.flag }} {{ c.code }} +{{ c.dial }}</option>
        }
      </select>
      <input class="input" type="tel" inputmode="tel" [id]="inputId()"
             [ngModel]="national()" name="phoneNational"
             [ngModelOptions]="{standalone: true}"
             (ngModelChange)="onNationalChange($event)"
             [placeholder]="placeholder()" [attr.aria-invalid]="showError() ? 'true' : null" />
    </div>
    @if (showError()) {
      <p class="field-note text-crit-500" role="alert">{{ error() }}</p>
    } @else if (national().trim()) {
      <p class="field-note text-[color:var(--text-muted)]">Will be saved as {{ value() }}</p>
    }
  `,
})
export class PhoneInput {
  /** E.164 in and out; empty string means no number. */
  readonly value = model<string>('');
  readonly inputId = input<string>('phoneNumber');
  /** Set once the form has been submitted, so errors do not appear while still typing. */
  readonly submitted = input(false);

  readonly country = signal<CountryCode>('US');
  readonly national = signal('');

  /**
   * Every country libphonenumber knows, sorted by name rather than code -- somebody looking for
   * Pakistan scans for P, not for the +92 they may not know.
   */
  readonly countries = getCountries()
    .map(code => ({
      code,
      dial: getCountryCallingCode(code),
      flag: PhoneInput.flagOf(code),
      name: PhoneInput.nameOf(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /** A real example for the chosen country, so the expected shape is obvious before typing. */
  readonly placeholder = computed(() => {
    const example = PhoneInput.EXAMPLES[this.country()];
    return example ?? 'Phone number';
  });

  readonly error = signal('');
  readonly showError = computed(() => this.submitted() && !!this.error());

  constructor() {
    // Repopulate both boxes when an existing value arrives -- editing a user has to show the
    // country their number already belongs to, not the default.
    effect(() => {
      const incoming = this.value();
      if (!incoming) return;
      const parsed = parsePhoneNumberFromString(incoming);
      if (!parsed) return;
      if (parsed.country && parsed.country !== this.country()) this.country.set(parsed.country);
      const national = parsed.nationalNumber ?? '';
      if (national !== this.national()) this.national.set(national);
    });
  }

  onCountryChange(code: CountryCode): void {
    this.country.set(code);
    this.recompute();
  }

  onNationalChange(raw: string): void {
    // Formatted as typed, so the digits group the way that country writes them.
    const formatted = new AsYouType(this.country()).input(raw);
    this.national.set(formatted);
    this.recompute();
  }

  private recompute(): void {
    const digits = this.national().trim();
    if (!digits) {
      this.error.set('');
      this.value.set('');
      return;
    }
    const parsed = parsePhoneNumberFromString(digits, this.country());
    if (!parsed || !parsed.isValid()) {
      // Names the country, because the same digits can be valid in one and not another.
      this.error.set(`That is not a valid ${this.country()} number — check the digits.`);
      this.value.set('');
      return;
    }
    this.error.set('');
    this.value.set(parsed.number);
  }

  /** ISO code to flag: two regional indicator symbols, no image needed. */
  private static flagOf(code: string): string {
    return code.replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
  }

  private static readonly DISPLAY = new Intl.DisplayNames(['en'], { type: 'region' });

  private static nameOf(code: string): string {
    try {
      return PhoneInput.DISPLAY.of(code) ?? code;
    } catch {
      return code;
    }
  }

  /** A handful of the commonest, so the placeholder is useful without shipping every example. */
  private static readonly EXAMPLES: Partial<Record<CountryCode, string>> = {
    US: '(202) 555-0143', GB: '20 7946 0958', PK: '300 1234567', IN: '81234 56789',
    AE: '50 123 4567', SA: '50 123 4567', DE: '30 123456', FR: '6 12 34 56 78',
    CA: '(416) 555-0143', AU: '412 345 678', QA: '3312 3456', SG: '8123 4567',
  };
}
