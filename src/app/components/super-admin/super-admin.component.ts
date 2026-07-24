import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MultiSelectComponent } from '../../shared/multi-select/multi-select.component';
import { DbService, Job, User, FileType, Vertical } from '../../services/db.service';

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, MultiSelectComponent, RouterModule],
  templateUrl: './super-admin.component.html',
  styleUrls: ['./super-admin.component.css']
})
export class SuperAdminComponent implements OnInit {
  activeTab: 'job' | 'user' | 'filetype' | 'vertical' = 'job';
  globalLoading: boolean = false;

  // Options from database
  icOptions: string[] = [];
  verticalOptions: string[] = [];

  // Form states
  // 1. Job form
  jobIc: string[] = [];
  jobVertical: string[] = [];
  jobCode: number | null = null;
  jobName: string = '';

  // 2. User form
  userIc: string[] = [];
  userEmail: string = '';

  // 3. File Type form
  filetypeIc: string[] = [];
  filetypeName: string = '';

  // 4. Vertical form
  verticalIc: string[] = [];
  verticalName: string = '';

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

  selectTab(tab: 'job' | 'user' | 'filetype' | 'vertical') {
    this.activeTab = tab;
  }

  // --- Actions ---

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

  async submitUser() {
    const email = this.userEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (this.userIc.length === 0) {
      this.showToast('User IC selection is required.', 'error');
      return;
    }
    if (!email) {
      this.showToast('User Email is required.', 'error');
      return;
    }
    if (!emailRegex.test(email)) {
      this.showToast('Invalid User Email format.', 'error');
      return;
    }

    this.showLoader();
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Latency mock
      const record: User = {
        ic: this.userIc,
        email
      };
      const action = await this.dbService.upsertUserRecord(record);
      this.showToast(`User ${email} saved (${action}) successfully.`);
      this.clearUser();
    } catch (err: any) {
      this.showToast(err.message, 'error');
    } finally {
      this.globalLoading = false;
      this.cdr.detectChanges();
    }
  }

  clearUser() {
    this.userIc = [];
    this.userEmail = '';
  }

  async submitFileType() {
    const ft = this.filetypeName.trim();
    if (this.filetypeIc.length === 0) {
      this.showToast('File Type IC selection is required.', 'error');
      return;
    }
    if (!ft) {
      this.showToast('File Type name is required.', 'error');
      return;
    }

    this.showLoader();
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Latency mock
      const record: FileType = {
        ic: this.filetypeIc,
        fileType: ft
      };
      const action = await this.dbService.upsertFileTypeRecord(record);
      this.showToast(`File Type "${ft}" saved (${action}) successfully.`);
      this.clearFileType();
    } catch (err: any) {
      this.showToast(err.message, 'error');
    } finally {
      this.globalLoading = false;
      this.cdr.detectChanges();
    }
  }

  clearFileType() {
    this.filetypeIc = [];
    this.filetypeName = '';
  }

  async submitVertical() {
    const vName = this.verticalName.trim();
    if (this.verticalIc.length === 0) {
      this.showToast('Vertical IC selection is required.', 'error');
      return;
    }
    if (!vName) {
      this.showToast('Vertical Name is required.', 'error');
      return;
    }

    this.showLoader();
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Latency mock
      const record: Vertical = {
        ic: this.verticalIc,
        verticalName: vName
      };
      const action = await this.dbService.upsertVerticalRecord(record);
      this.showToast(`Vertical "${vName}" saved (${action}) successfully.`);
      
      // Update dropdown vertical options choices in UI
      const db = this.dbService.getDatabase();
      this.verticalOptions = db.verticals;
      
      this.clearVertical();
    } catch (err: any) {
      this.showToast(err.message, 'error');
    } finally {
      this.globalLoading = false;
      this.cdr.detectChanges();
    }
  }

  clearVertical() {
    this.verticalIc = [];
    this.verticalName = '';
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
