import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MultiSelectComponent } from '../../shared/multi-select/multi-select.component';
import { DbService, Job } from '../../services/db.service';

@Component({
  selector: 'app-ic-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, MultiSelectComponent, RouterModule],
  templateUrl: './ic-admin.component.html',
  styleUrls: ['./ic-admin.component.css']
})
export class IcAdminComponent implements OnInit {
  globalLoading: boolean = false;

  // Options from database
  icOptions: string[] = [];
  verticalOptions: string[] = [];

  // Form states
  jobIc: string[] = [];
  jobVertical: string[] = [];
  jobCode: number | null = null;
  jobName: string = '';

  // Toast notifications list
  toasts: { id: number; message: string; type: 'success' | 'error' }[] = [];
  private nextToastId = 0;

  constructor(private dbService: DbService, private cdr: ChangeDetectorRef) {}

  showLoader() {
    this.globalLoading = true;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.globalLoading = false;
      this.cdr.detectChanges();
    }, 200);
  }

  async ngOnInit() {
    this.showLoader();
    try {
      const db = await this.dbService.loadDatabase();
      this.icOptions = db.ics;
      this.verticalOptions = db.verticals;
    } catch (e: any) {
      this.showToast('Failed to load configuration options', 'error');
    } finally {
      this.globalLoading = false;
      this.cdr.detectChanges();
    }
  }

  showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = this.nextToastId++;
    this.toasts.push({ id, message, type });
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id);
    }, 4000);
  }

  async submitJob() {
    if (this.jobIc.length === 0) {
      this.showToast('Job IC selection is required.', 'error');
      return;
    }
    if (this.jobVertical.length === 0) {
      this.showToast('Job Vertical selection is required.', 'error');
      return;
    }
    if (this.jobCode === null || this.jobCode === undefined || String(this.jobCode).trim() === '') {
      this.showToast('Job Code is required.', 'error');
      return;
    }
    const codeNum = Number(this.jobCode);
    if (isNaN(codeNum) || !Number.isInteger(codeNum) || codeNum <= 0) {
      this.showToast('Job Code must be a positive integer.', 'error');
      return;
    }
    if (!this.jobName.trim()) {
      this.showToast('Job Name is required.', 'error');
      return;
    }

    this.showLoader();
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Latency mock
      const record: Job = {
        ic: this.jobIc,
        vertical: this.jobVertical,
        jobCode: codeNum,
        jobName: this.jobName.trim()
      };
      const action = await this.dbService.upsertJobRecord(record);
      this.showToast(`Job ${codeNum} - "${record.jobName}" saved (${action}) successfully.`);
      this.clearJob();
    } catch (err: any) {
      this.showToast(err.message, 'error');
    } finally {
      this.globalLoading = false;
      this.cdr.detectChanges();
    }
  }

  clearJob() {
    this.jobIc = [];
    this.jobVertical = [];
    this.jobCode = null;
    this.jobName = '';
  }

  exportJson() {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.dbService.getDatabase(), null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', 'admin_data.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      this.showToast('Downloaded admin_data.json successfully!');
    } catch (err) {
      this.showToast('Failed to export JSON file.', 'error');
    }
  }
}
