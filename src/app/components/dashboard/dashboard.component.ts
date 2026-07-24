import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectComponent } from '../../shared/multi-select/multi-select.component';
import { SupabaseService } from '../../services/supabase.service';
import { ExportService } from '../../services/export.service';
import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

import { RouterModule } from '@angular/router';

Chart.register(...registerables, ChartDataLabels);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MultiSelectComponent, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gaugeCanvas') gaugeCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('buCanvas') buCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('ageingCanvas') ageingCanvas!: ElementRef<HTMLCanvasElement>;

  // Selected filter states
  selectedIcs: string[] = [];
  selectedFiletypes: string[] = [];
  selectedBus: string[] = [];
  selectedJobs: string[] = [];
  selectedApprovers: string[] = [];
  selectedStatus: string = 'All';

  // Available option lists loaded from Supabase RPCs
  icOptions: string[] = [];
  filetypeOptions: string[] = [];
  buOptions: string[] = [];
  jobOptions: string[] = [];
  approverOptions: string[] = [];

  // Dropdown load states
  filterLoading: { [key: string]: boolean } = {};
  filterFailed: { [key: string]: boolean } = {};

  // Loading spinner state
  globalLoading: boolean = false;

  // KPI states
  kpiTotal = 0;
  kpiPending = 0;
  kpiStopped = 0;
  kpiRejected = 0;
  kpiApproved = 0;
  kpiPaused = 0;

  // Gauge states
  avgDays = 0.00;
  minDays = 0.00;
  maxDays = 0.00;

  // Search terms for tables
  searchBuTerm = '';
  searchAgeingTerm = '';

  // Table row click highlight selections
  selectedBuName = '';
  selectedBuCount = 0;
  selectedAgeingLabel = '';
  selectedAgeingCount = 0;

  // Merged chart datasets backing tables
  buChartMerged: { bu_name: string; cnt: number }[] = [];
  ageingLabels: string[] = [];
  ageingValues: number[] = [];

  // Chart instances
  private gaugeChartInst: any;
  private buChartInst: any;
  private ageingChartInst: any;

  // Debouncing filter refreshes
  private refreshTimer: any;

  constructor(private supabase: SupabaseService, private exporter: ExportService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadFilterOptions();
  }

  ngAfterViewInit() {
    // Initial data refresh once view is ready
    this.refreshAll();
  }

  ngOnDestroy() {
    clearTimeout(this.refreshTimer);
    this.destroyCharts();
  }

  private destroyCharts() {
    if (this.gaugeChartInst) this.gaugeChartInst.destroy();
    if (this.buChartInst) this.buChartInst.destroy();
    if (this.ageingChartInst) this.ageingChartInst.destroy();
  }

  // ---------- Dropdowns Options Loading ----------

  async fetchFilterList(key: string, fn: string, field: string) {
    this.filterLoading[key] = true;
    this.filterFailed[key] = false;

    const { ok, data } = await this.supabase.callRpcWithRetry(fn, {});
    this.filterLoading[key] = false;

    if (ok) {
      const vals = Array.from(new Set(data.map((r: any) => r[field]).filter(Boolean))) as string[];
      vals.sort((a, b) => a.localeCompare(b));
      if (key === 'ic') this.icOptions = vals;
      else if (key === 'filetype') this.filetypeOptions = vals;
      else if (key === 'bu') this.buOptions = vals;
      else if (key === 'job') this.jobOptions = vals;
      else if (key === 'approver') this.approverOptions = vals;
    } else {
      this.filterFailed[key] = true;
    }
  }

  loadFilterOptions() {
    this.fetchFilterList('ic', 'get_ic_list', 'ic');
    this.fetchFilterList('filetype', 'get_filetype_list', 'file_type_name');
    this.fetchFilterList('bu', 'get_bu_list', 'bu_name');
    this.fetchFilterList('job', 'get_job_list', 'job_details');
    this.fetchFilterList('approver', 'get_approver_list', 'approver_name');
  }

  // ---------- Combinations Generator & Merge Helpers ----------

  cartesianCombos() {
    const dims = [
      this.selectedIcs.length ? this.selectedIcs : ['All'],
      this.selectedFiletypes.length ? this.selectedFiletypes : ['All'],
      this.selectedBus.length ? this.selectedBus : ['All'],
      this.selectedJobs.length ? this.selectedJobs : ['All'],
      this.selectedApprovers.length ? this.selectedApprovers : ['All']
    ];

    const MAX_COMBOS = 60;
    let combos: any[][] = [[]];
    for (const dim of dims) {
      const next: any[][] = [];
      for (const combo of combos) {
        for (const val of dim) {
          next.push([...combo, val]);
          if (next.length >= MAX_COMBOS) break;
        }
        if (next.length >= MAX_COMBOS) break;
      }
      combos = next;
      if (combos.length >= MAX_COMBOS) break;
    }
    if (combos.length > MAX_COMBOS) {
      console.warn(`Filter combination count exceeds ${MAX_COMBOS}; truncating.`);
      combos = combos.slice(0, MAX_COMBOS);
    }

    const paramsList = ['p_ic', 'p_filetype', 'p_bu', 'p_job', 'p_approver'];
    return combos.map((vals) => {
      const p: any = {};
      paramsList.forEach((param, i) => { p[param] = vals[i]; });
      return p;
    });
  }

  combosWithStatus() {
    return this.cartesianCombos().map((p) => ({ ...p, p_status: this.selectedStatus }));
  }

  private mergeCountRows(rowsArrays: any[][], keyField: string, cntField: string = 'cnt'): any[] {
    const map = new Map<any, number>();
    rowsArrays.flat().forEach((r) => {
      const k = r[keyField];
      if (k === null || k === undefined) return;
      map.set(k, (map.get(k) || 0) + Number(r[cntField] || 0));
    });
    return Array.from(map.entries()).map(([k, v]) => ({ [keyField]: k, [cntField]: v }));
  }

  // ---------- Orchestration & Refresh ----------

  onFilterChange() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refreshAll(), 180);
  }

  async refreshAll() {
    this.globalLoading = true;
    this.clearBuSelection();
    this.clearAgeingSelection();
    this.cdr.detectChanges();

    // Auto-dismiss loader after 200ms to ensure the dashboard remains interactive
    const loaderTimeout = setTimeout(() => {
      this.globalLoading = false;
      this.cdr.detectChanges();
    }, 200);

    try {
      await Promise.all([
        this.loadKPIs(),
        this.loadGaugeAndAgeing(),
        this.loadBUChart()
      ]);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      clearTimeout(loaderTimeout);
      this.globalLoading = false;
      this.cdr.detectChanges();
    }
  }

  clearAllFilters() {
    this.selectedIcs = [];
    this.selectedFiletypes = [];
    this.selectedBus = [];
    this.selectedJobs = [];
    this.selectedApprovers = [];
    this.selectedStatus = 'All';
    this.searchBuTerm = '';
    this.searchAgeingTerm = '';
    this.refreshAll();
  }

  // ---------- KPIs Loader ----------

  async loadKPIs() {
    const combos = this.cartesianCombos();
    const results = await Promise.all(combos.map((p) => this.supabase.callRpc('get_status_counts', p)));
    const merged = this.mergeCountRows(results, 'status');

    const counts: { [key: string]: number } = { Pending: 0, Stopped: 0, Rejected: 0, Approved: 0, Paused: 0 };
    let total = 0;
    merged.forEach((r) => {
      counts[r.status] = Number(r.cnt);
      total += Number(r.cnt);
    });

    this.kpiTotal = total;
    this.kpiPending = counts['Pending'];
    this.kpiStopped = counts['Stopped'];
    this.kpiRejected = counts['Rejected'];
    this.kpiApproved = counts['Approved'];
    this.kpiPaused = counts['Paused'];
  }

  toggleStatusFilter(status: string) {
    this.selectedStatus = this.selectedStatus === status ? 'All' : status;
    this.refreshAll();
  }

  // ---------- Gauge & Ageing Loader ----------

  async loadGaugeAndAgeing() {
    const combos = this.combosWithStatus();

    const ageingResults = await Promise.all(combos.map((p) => this.supabase.callRpc('get_ageing_counts', p)));
    const ageingMergedRaw = this.mergeCountRows(ageingResults, 'request_ageing_days');
    this.renderAgeingChart(ageingMergedRaw);

    const comboTotals = ageingResults.map((rows) => rows.reduce((s, r) => s + Number(r.cnt || 0), 0));

    const avgResults = await Promise.all(combos.map((p) => this.supabase.callRpc('get_avg_days', p)));
    let wsum = 0, wcount = 0, minAll = Infinity, maxAll = -Infinity;

    avgResults.forEach((rows, i) => {
      const r = rows[0] || { avg_days: 0, min_days: 0, max_days: 0 };
      const w = comboTotals[i];
      wsum += Number(r.avg_days || 0) * w;
      wcount += w;
      if (w > 0) {
        minAll = Math.min(minAll, Number(r.min_days || 0));
        maxAll = Math.max(maxAll, Number(r.max_days || 0));
      }
    });

    this.avgDays = wcount ? wsum / wcount : 0;
    this.minDays = isFinite(minAll) ? minAll : 0;
    this.maxDays = isFinite(maxAll) ? maxAll : 1.0;
    this.renderGauge(this.avgDays, this.minDays, this.maxDays);
  }

  // ---------- Chart Render Helpers ----------

  private renderGauge(avg: number, min: number, max: number) {
    if (!this.gaugeCanvas) return;
    const pct = Math.min(1, Math.max(0, (avg - min) / (max - min || 1)));
    const remainder = 1 - pct;

    const ctx = this.gaugeCanvas.nativeElement;
    const cfg: any = {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [pct, remainder],
            backgroundColor: ['#e8752c', '#2e6b32'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        circumference: 180,
        rotation: 270,
        cutout: '72%',
        plugins: { legend: { display: false }, tooltip: { enabled: false }, datalabels: { display: false } },
        animation: false,
      },
    };

    if (this.gaugeChartInst) {
      this.gaugeChartInst.data.datasets[0].data = [pct, remainder];
      this.gaugeChartInst.update();
    } else {
      this.gaugeChartInst = new Chart(ctx, cfg);
    }
  }

  private renderAgeingChart(mergedRawRows: any[]) {
    if (!this.ageingCanvas) return;
    const groups: { [key: string]: number } = {
      '0-5 Days': 0,
      '6-10 Days': 0,
      '11-20 Days': 0,
      '21-30 Days': 0,
      '31-45 Days': 0,
      '46-60 Days': 0,
      '60+ Days': 0,
    };

    mergedRawRows.forEach((r) => {
      const day = Number(r.request_ageing_days);
      const count = Number(r.cnt);

      if (day <= 5) groups['0-5 Days'] += count;
      else if (day <= 10) groups['6-10 Days'] += count;
      else if (day <= 20) groups['11-20 Days'] += count;
      else if (day <= 30) groups['21-30 Days'] += count;
      else if (day <= 45) groups['31-45 Days'] += count;
      else if (day <= 60) groups['46-60 Days'] += count;
      else groups['60+ Days'] += count;
    });

    this.ageingLabels = Object.keys(groups);
    this.ageingValues = Object.values(groups);

    const ctx = this.ageingCanvas.nativeElement;
    if (this.ageingChartInst) this.ageingChartInst.destroy();

    this.ageingChartInst = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.ageingLabels,
        datasets: [
          {
            data: this.ageingValues,
            borderRadius: 15,
            barThickness: 28,
            backgroundColor: (context: any) => {
              const chart = context.chart;
              const { ctx } = chart;
              const idx = context.dataIndex;
              const g = ctx.createLinearGradient(0, 0, 0, chart.chartArea ? chart.chartArea.bottom : 300);
              const base = ['#1D4ED8', '#60A5FA'][idx % 2];
              g.addColorStop(0, '#93C5FD');
              g.addColorStop(0.35, base);
              g.addColorStop(1, '#1E3A8A');
              return g;
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        onClick: (evt: any, elements: any[]) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          this.selectAgeing(this.ageingLabels[idx]);
        },
        onHover: (evt: any, elements: any[]) => {
          evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
        },
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end',
            align: 'right',
            color: '#111827',
            font: { weight: 'bold', size: 13 },
          },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#e5e7eb' } },
          y: { grid: { display: false } },
        },
      },
      plugins: [ChartDataLabels],
    });
  }

  // ---------- BU Chart Loader ----------

  async loadBUChart() {
    const combos = this.combosWithStatus();
    const results = await Promise.all(combos.map((p) => this.supabase.callRpc('get_bu_counts', p)));
    this.buChartMerged = this.mergeCountRows(results, 'bu_name').sort((a, b) => b.cnt - a.cnt);

    const labels = this.buChartMerged.map((r) => r.bu_name);
    const data = this.buChartMerged.map((r) => Number(r.cnt));

    if (!this.buCanvas) return;
    const ctx = this.buCanvas.nativeElement;
    const cfg: any = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data,
            barThickness: 14,
            maxBarThickness: 18,
            borderRadius: 12,
            backgroundColor: (context: any) => {
              const chart = context.chart;
              const { ctx } = chart;
              const idx = context.dataIndex;
              const g = ctx.createLinearGradient(0, 0, 0, chart.chartArea ? chart.chartArea.bottom : 300);
              const palette = ['#93C5FD', '#60A5FA', '#2563EB', '#1E40AF'];
              const top = palette[(idx + 1) % palette.length];
              const mid = palette[(idx + 2) % palette.length];
              const bottom = palette[(idx + 3) % palette.length];
              g.addColorStop(0, top);
              g.addColorStop(0.45, mid);
              g.addColorStop(1, bottom);
              return g;
            },
            borderColor: 'rgba(15, 23, 42, 0.10)',
            hoverBackgroundColor: '#3b82f6',
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt: any, elements: any[]) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const row = this.buChartMerged[idx];
          if (row) this.selectBu(row.bu_name);
        },
        onHover: (evt: any, elements: any[]) => {
          evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `Count: ${Number(ctx.parsed.x).toLocaleString('en-IN')}`,
            },
          },
          datalabels: {
            anchor: 'end',
            align: 'end',
            color: '#0f172a',
            font: { size: 11, weight: '900' },
            formatter: (v: number) => v.toLocaleString('en-IN'),
            offset: 6,
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Count of UniqueId', font: { weight: '900' } },
            grid: { color: 'rgba(15,23,42,0.06)' },
            ticks: { font: { size: 10, weight: '800' }, color: 'rgba(15,23,42,0.65)' },
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 10, weight: '800' }, color: 'rgba(15,23,42,0.70)' },
          },
        },
      },
      plugins: [ChartDataLabels],
    };

    if (this.buChartInst) this.buChartInst.destroy();
    this.buChartInst = new Chart(ctx, cfg);
  }

  // ---------- Linking Tables Search & Selection ----------

  get filteredBuRows() {
    if (!this.searchBuTerm) return this.buChartMerged;
    const term = this.searchBuTerm.toLowerCase();
    return this.buChartMerged.filter((r) => r.bu_name.toLowerCase().includes(term));
  }

  get buRowsTotal() {
    return this.buChartMerged.reduce((s, r) => s + Number(r.cnt || 0), 0);
  }

  selectBu(buName: string) {
    const row = this.buChartMerged.find((r) => r.bu_name === buName);
    if (!row) return;

    this.selectedBuName = buName;
    this.selectedBuCount = row.cnt;

    // Scroll to item in table list
    setTimeout(() => {
      const container = document.getElementById('tbl-bu');
      const target = container?.querySelector(`[data-name="${buName.replace(/"/g, '\\"')}"]`);
      if (target) {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 50);
  }

  clearBuSelection() {
    this.selectedBuName = '';
    this.selectedBuCount = 0;
  }

  get filteredAgeingRows() {
    const items = this.ageingLabels.map((label, i) => ({ label, cnt: this.ageingValues[i] }));
    if (!this.searchAgeingTerm) return items;
    const term = this.searchAgeingTerm.toLowerCase();
    return items.filter((r) => r.label.toLowerCase().includes(term));
  }

  get ageingRowsTotal() {
    return this.ageingValues.reduce((s, v) => s + Number(v || 0), 0);
  }

  selectAgeing(label: string) {
    const idx = this.ageingLabels.indexOf(label);
    if (idx === -1) return;

    this.selectedAgeingLabel = label;
    this.selectedAgeingCount = this.ageingValues[idx];

    // Scroll to item in table list
    setTimeout(() => {
      const container = document.getElementById('tbl-ageing');
      const target = container?.querySelector(`[data-name="${label.replace(/"/g, '\\"')}"]`);
      if (target) {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 50);
  }

  clearAgeingSelection() {
    this.selectedAgeingLabel = '';
    this.selectedAgeingCount = 0;
  }

  // ---------- Exports Integration ----------

  doExport(fmt: 'csv' | 'json' | 'pdf') {
    const buRows = this.buChartMerged.map((r) => ({ bu_name: r.bu_name, cnt: r.cnt }));
    const ageingRows = this.ageingLabels.map((label, i) => ({ ageing_bucket: label, cnt: this.ageingValues[i] }));

    const filters = {
      ic: this.selectedIcs,
      filetype: this.selectedFiletypes,
      bu: this.selectedBus,
      job: this.selectedJobs,
      approver: this.selectedApprovers,
      status: this.selectedStatus,
    };

    const filenameBase = `edoc_export_${this.exporter.formatTimestamp(new Date())}`;

    if (fmt === 'csv') {
      this.exporter.exportChartsToCsv(filenameBase, buRows, ageingRows);
    } else if (fmt === 'json') {
      this.exporter.exportChartsToJson(filenameBase, buRows, ageingRows, filters);
    } else if (fmt === 'pdf') {
      const title = 'E-Doc Dashboard Export';
      const sections: [string, any[] | string][] = [
        ['BU Wise Total Count', buRows],
        ['Request Ageing Days', ageingRows],
      ];
      this.exporter.exportPdfFromText(`${filenameBase}.pdf`, title, sections);
    }
  }

  // ---------- Active chips helper ----------

  get activeChips() {
    const chips: { key: string; label: string; text: string }[] = [];
    if (this.selectedIcs.length) {
      chips.push({ key: 'ic', label: 'IC', text: this.selectedIcs.length === 1 ? this.selectedIcs[0] : `${this.selectedIcs.length} selected` });
    }
    if (this.selectedFiletypes.length) {
      chips.push({ key: 'filetype', label: 'FileTypeName', text: this.selectedFiletypes.length === 1 ? this.selectedFiletypes[0] : `${this.selectedFiletypes.length} selected` });
    }
    if (this.selectedBus.length) {
      chips.push({ key: 'bu', label: 'BU Name', text: this.selectedBus.length === 1 ? this.selectedBus[0] : `${this.selectedBus.length} selected` });
    }
    if (this.selectedJobs.length) {
      chips.push({ key: 'job', label: 'Job Details', text: this.selectedJobs.length === 1 ? this.selectedJobs[0] : `${this.selectedJobs.length} selected` });
    }
    if (this.selectedApprovers.length) {
      chips.push({ key: 'approver', label: 'Approver', text: this.selectedApprovers.length === 1 ? this.selectedApprovers[0] : `${this.selectedApprovers.length} selected` });
    }
    if (this.selectedStatus !== 'All') {
      chips.push({ key: 'status', label: 'Status', text: this.selectedStatus });
    }
    return chips;
  }

  clearChip(key: string) {
    if (key === 'ic') this.selectedIcs = [];
    else if (key === 'filetype') this.selectedFiletypes = [];
    else if (key === 'bu') this.selectedBus = [];
    else if (key === 'job') this.selectedJobs = [];
    else if (key === 'approver') this.selectedApprovers = [];
    else if (key === 'status') this.selectedStatus = 'All';
    this.refreshAll();
  }
}
