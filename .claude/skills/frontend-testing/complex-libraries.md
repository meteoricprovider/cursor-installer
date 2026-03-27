# Testing Components with Complex Libraries

JSDOM cannot fully render Canvas-based charts, contentEditable rich text, or virtualized grids. **Test around the library, not through it.**

## Strategy: Split What You Test

```text
Your code (test these in isolation):
  - Data logic: transforms, config builders, formatters
  - Custom UI pieces: cell renderers, toolbar buttons, tooltip content

Library internals (don't test — JSDOM can't render):
  - Canvas, virtual DOM, contentEditable, selection API
```

## TipTap / Rich Text

**Do test:** Toolbar button interactions via `userEvent`, content passed to `onUpdate` callbacks, read-only mode enforcement, keyboard shortcuts your code handles, custom extension behavior.

**Don't test:** Text selection, cursor positioning, drag-and-drop of blocks, ProseMirror internal DOM, bubble menu positioning.

```tsx
// GOOD: tests toolbar behavior
test("applies bold formatting when toolbar button clicked", async () => {
  const user = userEvent.setup();
  render(<RichTextInput value={content} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: /bold/i }));
  expect(screen.getByRole("button", { name: /bold/i })).toHaveAttribute("aria-pressed", "true");
});

// GOOD: tests data contract
test("calls onChange with updated content when user types", async () => {
  const onChange = vi.fn();
  render(<RichTextInput onChange={onChange} />);
  // ... interact with editor
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: "doc" }));
});
```

**Required setup:** Import `setupProseMirrorDomMocks` to polyfill `Range.getClientRects`, `getBoundingClientRect`, etc.

## Highcharts

**Do test:** Data transformation functions (pure logic), tooltip content components in isolation, loading/empty/error states around the chart, user interactions with controls outside the chart (date pickers, filters).

**Don't test:** Chart visual rendering (Canvas-based), axis labels, gridlines, legend positioning, animations, that specific API URLs were called with params (interaction testing), how many times data was fetched.

```tsx
// GOOD: tests data transformation in isolation
test("builds series data from API response", () => {
  const apiData = [
    { date: "2024-01", value: 100 },
    { date: "2024-02", value: 200 },
  ];
  const series = buildChartSeries(apiData);
  expect(series).toEqual([
    {
      name: "Volume",
      data: [
        [Date.parse("2024-01"), 100],
        [Date.parse("2024-02"), 200],
      ],
    },
  ]);
});

// GOOD: tests tooltip component in isolation
test("displays formatted value in tooltip", () => {
  render(<ChartTooltipContent point={{ y: 1234.5 }} currencyCode="EUR" />);
  expect(screen.getByText("€1,234.50")).toBeInTheDocument();
});

// GOOD: tests wrapper behavior, not chart internals
test("shows loading skeleton while data is fetching", () => {
  render(<VolumeChart data={undefined} isLoading={true} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
});

// GOOD: happy path = loading state disappears (use shared mocks)
test("loads price development data for the given view", async () => {
  GETPriceDevelopmentDataMock({ data: mockData });
  render(<PriceDevelopmentChart viewId="view_123" />);
  await waitFor(() => {
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
```

**If you need to assert on chart data** (integration tests), access the chart instance via `Highcharts.charts` and assert on `series[].data` — but prefer testing the config-building logic in isolation instead.

## AG Grid

**Do test:** Cell renderer components in isolation, cell editor components in isolation, column definition factories (pure functions), filter logic, batch action toolbar behavior, row selection callbacks.

**Don't test:** Virtual scrolling, row virtualization, column resizing/dragging/reordering, cell layout measurements, AG Grid's internal DOM structure.

```tsx
// GOOD: tests cell renderer in isolation
test("renders supplier tags", () => {
  render(<SuppliersCell suppliers={[{ id: "1", name: "Acme" }]} />);
  expect(screen.getByText("Acme")).toBeInTheDocument();
});

// GOOD: tests column definition factory (pure logic)
test("creates date column with correct formatter", () => {
  const col = createDateColumn({ colId: "createdAt", headerName: "Created" });
  expect(col.type).toBe("date");
  expect(col.colId).toBe("createdAt");
});

// GOOD: tests cell editor interaction
test("commits value and stops editing on Enter", async () => {
  const user = userEvent.setup();
  const onCommitValue = vi.fn();
  render(<CurrencyCellEditor value={1234} onCommitValue={onCommitValue} />);
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "999.01");
  await user.keyboard("{Enter}");
  expect(onCommitValue).toHaveBeenCalledWith("999.01");
});
```

**For full grid integration tests:** Use the `DataGridProvider` wrapper with `DataGrid`, wait for cells to render with `waitFor`, then query the rendered cell content. Keep these tests focused on data display and user interactions, not grid layout.
