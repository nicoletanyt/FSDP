# Mobile calendar spacing

## Research

The calendar's spacing follows these principles from the sources reviewed:

- [Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout): align related elements, use negative space to express grouping, respect safe areas, and adapt to the available space and larger text rather than squeezing controls.
- [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): iOS's recommended default control size is 44×44 points; spacing between controls matters as much as their size. Native points are not a universal CSS conversion, so the web implementation uses the web-specific guidance below.
- [web.dev: Accessible tap targets](https://web.dev/articles/accessible-tap-targets): recommends approximately 48px touch targets and about 8px between targets. A visually small icon can sit inside a larger activation area.
- [W3C: Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html): describes a 44×44 CSS-pixel target at WCAG AAA, including equivalent-target exceptions. This is a sizing reference, not a claim that the entire application meets AAA.

## Applied spacing

These values are project choices based on those principles, not a prescribed Apple spacing scale. They use a 4px rhythm and retain the existing desktop layout and global typography.

| Area | Applied spacing |
| --- | --- |
| Content edges | Main content and simple overlay content use 16px padding. Complex overlay headers/bodies/footers own their 16px padding separately. Launcher clearance sits after main rather than inflating its padding. |
| Site navbar and Sheet | Sticky brand/Menu navbar with 16px padding, distinct from the calendar. The left Sheet uses 16px padding, 48px links and 8px link gaps. |
| Page controls | Calendar header has 16px padding and 12px vertical grouping. Compact arrow controls retain 44px targets and their existing small gaps; control groups wrap intact. |
| View popover | An icon-only 44px button to the right of month/year shows the current view and has an accessible label/description. The popover retains labelled Day/Multi Day/Month/List options, icons, a selection marker, 16px padding and 44px option heights. Multi Day shows two days. This is separate from the site's Menu/Sheet navigation. |
| Date selection | The seven-column date strips use the available full width. Removed side padding that reduced target widths below 44px at the narrowest tested viewport. The week strip has 8px vertical clearance; Month has 4px row gaps and 16px bottom clearance. |
| Agenda rows | At least 72px tall with 16px vertical padding, 12px between columns and 4px between the event title and metadata. A 72px time column leaves more room for names. |
| Agenda date groups | 24px between groups, with 8px between a date heading and its divider. |
| Timeline | 8px between event lanes. Events of at least one hour have 8px vertical padding; shorter blocks retain 4px so their times fit. Title/time separation is 4px. The 1.6px/minute scale and duration geometry are preserved. |

The compact seven-column date grid deliberately does not add 8px horizontal gaps: that would require more than a 320px screen to keep seven 44px targets. It keeps large activation areas and smaller visible date circles instead.

The sticky site navbar's measured height is included when Today refocuses the timeline, so the current-time marker lands below it. Page-specific controls scroll with the document.

Class roster rows use a single line for name, grade and the three icon actions. The 44px hit areas remain large even though their visible icons are small; name popovers expose full names and grades. This dense row is an intentional exception to the larger gaps used in general navigation.

## Verification

The existing Firefox/WebDriver suite is documented in `tests/mobile-responsive/README.md`. It checks:

- All calendar views at 320, 360, 390 and 430 CSS pixels without horizontal page overflow.
- Toolbar, week-strip and month-grid targets of at least 44px at 320/390/430px, allowing subpixel rounding tolerance.
- Measured 16px page/overlay padding and agenda-row padding, and 24px agenda-group separation.
- Sticky site navbar height below 96px in the tested portrait views.
- Today refocusing below the header at 390×700, 568×320 and 844×390.
- Existing view selection, class Drawer, attendance, availability, history and resize interactions.

Physical-device gestures, native date/time pickers and virtual keyboards still require device verification.
