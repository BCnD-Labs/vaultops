# Theming

Themes are local CSS files; a picker and file importer are future work.

The three layers in `src/ui/themes/default.css` are seed/primitive values (palette, radius, spacing and type scales), semantic roles (surfaces, text and states), and component/shape values (controls, editor, elevation and motion). Components consume roles and shapes; aliases propagate primitive changes. `src/ui/theme.css` maps Tailwind utilities to these tokens. Screen styles retain layout dimensions.

To add a theme, copy the default file, change every theme selector to your ID, import it in `theme.css`, and register its ID, name and supported modes in `themes/index.ts`. Supply every default token or an equivalent alias. Use an explicit light base, a `[data-mode="dark"]` block, and identical dark overrides inside `prefers-color-scheme: dark` for `[data-mode="system"]`. Explicit light mode ignores the OS; system mode follows OS changes live through CSS.

Startup loads `vaultops.theme` from localStorage before rendering. `saveThemeChoice({ id, mode })` persists a choice and `applyTheme(document.documentElement, choice)` applies it. Invalid or unavailable storage falls back to default/system.

For example, copy the complete default theme as `sage.css`, rename all selectors to `sage`, then override these light seed values (supply matching dark colors too):

```css
:root[data-theme="sage"] {
  --seed-accent: #52745b;
  --seed-on-accent: #ffffff;
  --seed-container: #e4f0e6;
  --seed-on-container: #203e28;
}
```

Check contrast after palette changes. Default filled blue buttons use dark text to meet 4.5:1 at compact text sizes. Elevation is reserved for floating content.

## Full token list

- `--seed-accent`: Palette primitive for accent.
- `--neutral-0`: Cool neutral ramp step 0.
- `--neutral-1`: Cool neutral ramp step 1.
- `--neutral-2`: Cool neutral ramp step 2.
- `--neutral-3`: Cool neutral ramp step 3.
- `--neutral-4`: Cool neutral ramp step 4.
- `--neutral-6`: Cool neutral ramp step 6.
- `--neutral-9`: Cool neutral ramp step 9.
- `--seed-on-accent`: Palette primitive for on accent.
- `--seed-container`: Palette primitive for container.
- `--seed-on-container`: Palette primitive for on container.
- `--seed-danger`: Palette primitive for danger.
- `--seed-danger-container`: Palette primitive for danger container.
- `--seed-on-danger`: Palette primitive for on danger.
- `--seed-warning`: Palette primitive for warning.
- `--radius-1`: Primitive radius scale step 1.
- `--radius-2`: Primitive radius scale step 2.
- `--space-unit`: Tailwind spacing scale unit.
- `--size-ui`: Primitive text size for ui.
- `--size-small`: Primitive text size for small.
- `--size-title`: Primitive text size for title.
- `--size-heading`: Primitive text size for heading.
- `--background`: Main window background.
- `--surface`: Floating content background.
- `--surface-container-low`: Tonal container background at low level.
- `--surface-container`: Standard tonal container background.
- `--surface-container-high`: Tonal container background at high level.
- `--foreground`: Main text color.
- `--muted-foreground`: Secondary text color.
- `--border`: Hairline divider and border color.
- `--primary`: Filled action background.
- `--primary-foreground`: Text on filled actions.
- `--primary-container`: Soft action tint.
- `--on-primary-container`: Text on soft action tints.
- `--accent`: Highlighted surface color.
- `--accent-foreground`: Highlighted text color.
- `--selection-bg`: Selected tree row background.
- `--selection-fg`: Selected tree row text.
- `--secondary`: Secondary button background.
- `--secondary-foreground`: Secondary button text color.
- `--muted`: Quiet placeholder surface.
- `--destructive`: Error text and destructive action background.
- `--destructive-container`: Soft error background.
- `--destructive-foreground`: Text on destructive actions.
- `--ring`: Keyboard focus color.
- `--warn`: Warning text color.
- `--bg`: Legacy alias for the window background.
- `--panel`: Sidebar and panel background.
- `--text`: Legacy alias for main text.
- `--line`: Legacy alias for dividers.
- `--bad`: Legacy alias for error text.
- `--hover-layer`: Hover overlay opacity.
- `--pressed-layer`: Pressed overlay opacity.
- `--radius-control`: Control and row corner rounding.
- `--radius-container`: Floating container corner rounding.
- `--radius-round`: Switch, scrollbar and badge rounding.
- `--control-height`: Standard control height.
- `--control-height-sm`: Small control height.
- `--font-size-ui`: Ui text size.
- `--font-size-small`: Small text size.
- `--font-size-title`: Title text size.
- `--font-size-heading`: Heading text size.
- `--font-sans`: UI font stack.
- `--font-mono`: Code and log font stack.
- `--font-editor`: Editor font stack.
- `--editor-width`: Editor and metadata column width.
- `--editor-font-size`: Editor font size.
- `--editor-line-height`: Editor line height.
- `--editor-h1-size`: Editor h1 size.
- `--editor-h2-size`: Editor h2 size.
- `--editor-h3-size`: Editor h3 size.
- `--code-font-size`: Code font size.
- `--elevation-1`: Lowest elevation, flat by default.
- `--elevation-2`: Floating menu and popover shadow.
- `--elevation-3`: Floating dialog shadow.
- `--shadow-color`: Shadow color.
- `--scrim`: Modal backdrop color.
- `--motion-fast`: Fast transition duration.
- `--motion-normal`: Normal transition duration.
