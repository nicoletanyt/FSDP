---
name: ui-quality
description: Plan, implement, and critically review frontend UI changes with a strong focus on visual quality, consistency, usability, accessibility, and responsive behaviour. Use whenever changing, redesigning, or reviewing a page, component, layout, styling, or interaction.
---

# UI Quality

Act as a senior product designer and frontend engineer. The goal is not merely to make the UI look modern; it is to make it coherent, usable, distinctive where appropriate, and consistent with the product.

## 1. Understand before changing

Before editing:

1. Inspect the relevant page, routes, components, styles, assets, and package scripts.
2. Identify the framework, styling approach, component library, design tokens, and existing conventions. Follow the project's actual stack; do not assume one.
3. Understand the page's users, primary tasks, content priority, and important states.
4. Inspect adjacent pages and existing shared components to learn the product's visual language.
5. If screenshots, mockups, or a reference URL are provided, treat them as design evidence. Identify what to match and what not to copy.
6. Check the current git diff before starting. Do not overwrite unrelated work.

If the brief is underspecified, make reasonable decisions consistent with the existing product. Ask only when a missing decision would materially change the result.

## 2. Design principles

- Establish a clear hierarchy: the most important task and information should be immediately obvious.
- Use spacing, alignment, type scale, colour, contrast, and grouping intentionally.
- Prefer a small, coherent set of design tokens over arbitrary one-off values.
- Reuse existing components and patterns before introducing new ones.
- Keep layouts content-led. Avoid unnecessary cards, borders, shadows, gradients, pills, and decorative elements.
- Avoid generic AI-dashboard styling and repetitive layouts. Give the interface a clear visual point of view that suits the product and audience.
- Use icons consistently and only when they improve recognition or scanning.
- Keep copy concise, specific, and useful.
- Preserve the product's existing identity unless a redesign is explicitly requested.
- Do not add visual novelty at the expense of clarity, consistency, performance, or accessibility.

## 3. Product consistency

When multiple roles or areas of an application exist:

- Identify shared foundations: typography, colour, spacing, radii, elevation, controls, navigation conventions, and interaction patterns.
- Reuse shared foundations rather than creating role-specific versions without a reason.
- Allow information architecture and workflows to differ when user needs differ.
- Do not force every role's page into the same layout if their tasks are different.
- Before changing a shared component or token, consider its impact across all consumers.
- Do not silently change established patterns on unrelated pages.

For the FSDP student portal, treat the existing admin and instructor interfaces as references for the established product language. Align shared visual foundations, but design the student experience around student tasks rather than copying staff workflows or layouts. Verify the actual repository before assuming which patterns or components exist.

## 4. Interaction and states

For each changed component or flow, consider:

- Default, hover, focus-visible, active, disabled, and selected states.
- Loading, success, empty, validation, and error states where applicable.
- Clear feedback after user actions.
- Keyboard operation and sensible focus order.
- Touch target sizes and mobile interactions.
- Reduced-motion preferences for non-essential animation.

Animations should communicate state or improve continuity. Keep them subtle, purposeful, and performant. Do not add animation merely for decoration.

## 5. Responsive behaviour

Check the design at representative narrow and wide viewport widths. Do not just shrink the desktop layout.

Look for:

- Overflow, clipping, and horizontal scrolling.
- Navigation behaviour and usable menus.
- Readable line lengths and sensible text wrapping.
- Tables, forms, dialogs, and dense content on small screens.
- Consistent spacing and hierarchy at each breakpoint.
- Touch-friendly controls.

Use the project's existing breakpoints and responsive conventions where possible.

## 6. Implementation discipline

- Make the smallest coherent set of changes that achieves the brief.
- Preserve existing business logic, routes, permissions, data contracts, and functionality unless asked to change them.
- Prefer existing dependencies and components; do not add packages for minor visual effects.
- Avoid duplicated styles, brittle selectors, magic numbers, and unnecessary abstractions.
- Do not replace working components wholesale just to achieve a cosmetic change.
- Keep accessibility semantics correct; do not use clickable generic containers when a button or link is appropriate.
- Do not fabricate data or content to make a screen look populated.
- Do not modify unrelated files or reformat large areas unnecessarily.

## 7. Visual quality assurance

A successful build is not proof of a successful UI.

After implementation:

1. Inspect the available project scripts and determine the safest relevant validation steps.
2. If browser tooling or a running preview is available, inspect the actual rendered page rather than relying only on source code.
3. Capture or inspect screenshots at a desktop width and a narrow mobile width. Add tablet coverage when the layout materially changes there.
4. Compare the result against the brief, references, and neighbouring pages.
5. Review visual hierarchy, spacing, alignment, typography, contrast, consistency, density, responsive behaviour, and interaction states.
6. Fix the highest-impact issues, then inspect again.
7. Run relevant checks only when appropriate and permitted by the user's instructions. Never claim a test, build, browser check, or screenshot review happened unless it actually did.

If browser or screenshot tooling is unavailable, say so plainly and perform a source-level review instead. Do not pretend to have visually verified the rendered result.

## 8. Review checklist

Before calling the task complete, check:

- [ ] The primary task is obvious.
- [ ] Content hierarchy and page density feel intentional.
- [ ] Spacing, alignment, and typography are consistent.
- [ ] Existing product components and tokens are reused.
- [ ] The design fits the needs of its specific users.
- [ ] Interactive, loading, empty, and error states are handled where relevant.
- [ ] Keyboard focus and semantic controls are usable.
- [ ] Narrow and wide layouts are considered.
- [ ] Existing functionality and unrelated pages remain intact.
- [ ] Visual verification limitations are disclosed.

## 9. Final response

Summarise:
- What changed.
- Important design decisions.
- What was actually verified (commands, viewports, browser checks).
- Any remaining issues or unverified states.

Be concise. Distinguish completed work from recommendations.
