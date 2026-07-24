import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from './supabase.service';
import { TABLE, MOCK_ICS, MOCK_VERTICALS } from '../config';
import { lastValueFrom } from 'rxjs';

export interface Job {
  ic: string[];
  vertical: string[];
  jobCode: number;
  jobName: string;
}

export interface User {
  ic: string[];
  email: string;
}

export interface FileType {
  ic: string[];
  fileType: string;
}

export interface Vertical {
  ic: string[];
  verticalName: string;
}

export interface DatabaseState {
  ics: string[];
  verticals: string[];
  jobs: Job[];
  users: User[];
  fileTypes: FileType[];
  verticalsList: Vertical[];
}

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private stateKey = 'admin_db';
  private db: DatabaseState = {
    ics: [],
    verticals: [],
    jobs: [],
    users: [],
    fileTypes: [],
    verticalsList: []
  };

  constructor(private http: HttpClient, private supabase: SupabaseService) {}

  /**
   * Initializes local config options and falls back to mock defaults or Supabase server lists.
   */
  async loadDatabase(): Promise<DatabaseState> {
    const localData = localStorage.getItem(this.stateKey);
    if (localData) {
      this.db = JSON.parse(localData);
    } else {
      try {
        const response = await lastValueFrom(this.http.get<DatabaseState>('admin_data.json'));
        if (response) {
          this.db = response;
        }
      } catch (error: any) {
        console.warn('Failed to load admin_data.json, using static defaults:', error.message);
        this.db = {
          ics: MOCK_ICS,
          verticals: MOCK_VERTICALS,
          jobs: [],
          users: [],
          fileTypes: [],
          verticalsList: []
        };
      }
    }

    // Override option choices from Supabase if connected
    try {
      const [icRes, buRes] = await Promise.all([
        this.supabase.callRpc('get_ic_list'),
        this.supabase.callRpc('get_bu_list')
      ]);

      const sbIcs = icRes.map((r: any) => r.ic).filter(Boolean);
      const sbVerticals = buRes.map((r: any) => r.bu_name).filter(Boolean);

      if (sbIcs.length > 0) {
        this.db.ics = sbIcs;
      }
      if (sbVerticals.length > 0) {
        this.db.verticals = sbVerticals;
      }
    } catch (e: any) {
      console.warn('Supabase options fetch failed, falling back to local lists:', e.message);
    }

    this.saveDatabase();
    return this.db;
  }

  saveDatabase(): void {
    localStorage.setItem(this.stateKey, JSON.stringify(this.db));
    this.saveToLocalFile(this.db);
  }

  getDatabase(): DatabaseState {
    return this.db;
  }

  private async saveToLocalFile(data: DatabaseState): Promise<void> {
    try {
      await lastValueFrom(this.http.post('/api/save', data));
      console.log('Database auto-saved to admin_data.json on disk.');
    } catch (err) {
      console.debug('Local file write-back not active. Offline/standalone client mode.');
    }
  }

  // --- CRUD ACTIONS ---

  // CARD 1: JOBS
  async insertJobRecord(job: Job): Promise<void> {
    if (this.db.jobs.some(j => j.jobCode === job.jobCode)) {
      throw new Error('Job Code already exists. Use Update to modify.');
    }
    this.db.jobs.push(job);
    this.saveDatabase();
  }

  async updateJobRecord(job: Job): Promise<void> {
    const idx = this.db.jobs.findIndex(j => j.jobCode === job.jobCode);
    if (idx === -1) {
      throw new Error(`Job Code ${job.jobCode} not found.`);
    }
    const oldJobName = this.db.jobs[idx].jobName;
    this.db.jobs[idx] = job;
    this.saveDatabase();

    // Sync to Supabase
    try {
      const updateData: any = { job_details: job.jobName };
      if (job.ic && job.ic.length) updateData.ic = job.ic[0];
      if (job.vertical && job.vertical.length) updateData.bu_name = job.vertical[0];

      const { error } = await this.supabase.client.from(TABLE).update(updateData).eq('job_details', oldJobName);
      if (error) console.warn('Supabase job update error:', error.message);
      else console.log('Synced Job updates to Supabase.');
    } catch (e: any) {
      console.warn('Failed to sync Job update to Supabase:', e.message);
    }
  }

  async upsertJobRecord(job: Job): Promise<'inserted' | 'updated'> {
    if (this.db.jobs.some(j => j.jobCode === job.jobCode)) {
      await this.updateJobRecord(job);
      return 'updated';
    } else {
      await this.insertJobRecord(job);
      return 'inserted';
    }
  }

  // CARD 2: USERS
  async insertUserRecord(user: User): Promise<void> {
    if (this.db.users.some(u => u.email === user.email)) {
      throw new Error('User Email already exists. Use Update to modify.');
    }
    this.db.users.push(user);
    this.saveDatabase();
  }

  async updateUserRecord(user: User): Promise<void> {
    const idx = this.db.users.findIndex(u => u.email === user.email);
    if (idx === -1) {
      throw new Error(`User with email ${user.email} not found.`);
    }
    this.db.users[idx] = user;
    this.saveDatabase();

    // Sync User IC update to Supabase
    try {
      if (user.ic && user.ic.length) {
        const { error } = await this.supabase.client.from(TABLE).update({ ic: user.ic[0] }).eq('approver_name', user.email);
        if (error) console.warn('Supabase user update error:', error.message);
        else console.log('Synced User updates to Supabase.');
      }
    } catch (e: any) {
      console.warn('Failed to sync User update to Supabase:', e.message);
    }
  }

  async upsertUserRecord(user: User): Promise<'inserted' | 'updated'> {
    if (this.db.users.some(u => u.email === user.email)) {
      await this.updateUserRecord(user);
      return 'updated';
    } else {
      await this.insertUserRecord(user);
      return 'inserted';
    }
  }

  // CARD 3: FILE TYPES
  async insertFileTypeRecord(fileTypeObj: FileType): Promise<void> {
    if (this.db.fileTypes.some(f => f.fileType.toLowerCase() === fileTypeObj.fileType.toLowerCase())) {
      throw new Error('File Type already exists.');
    }
    this.db.fileTypes.push(fileTypeObj);
    this.saveDatabase();
  }

  async updateFileTypeRecord(fileTypeObj: FileType): Promise<void> {
    const idx = this.db.fileTypes.findIndex(f => f.fileType.toLowerCase() === fileTypeObj.fileType.toLowerCase());
    if (idx === -1) {
      throw new Error(`File Type "${fileTypeObj.fileType}" not found.`);
    }
    this.db.fileTypes[idx] = fileTypeObj;
    this.saveDatabase();

    // Sync File Type IC update to Supabase
    try {
      if (fileTypeObj.ic && fileTypeObj.ic.length) {
        const { error } = await this.supabase.client.from(TABLE).update({ ic: fileTypeObj.ic[0] }).eq('file_type_name', fileTypeObj.fileType);
        if (error) console.warn('Supabase filetype update error:', error.message);
        else console.log('Synced File Type updates to Supabase.');
      }
    } catch (e: any) {
      console.warn('Failed to sync File Type update to Supabase:', e.message);
    }
  }

  async upsertFileTypeRecord(fileTypeObj: FileType): Promise<'inserted' | 'updated'> {
    const matchKey = fileTypeObj.fileType.toLowerCase();
    if (this.db.fileTypes.some(f => f.fileType.toLowerCase() === matchKey)) {
      await this.updateFileTypeRecord(fileTypeObj);
      return 'updated';
    } else {
      await this.insertFileTypeRecord(fileTypeObj);
      return 'inserted';
    }
  }

  // CARD 4: VERTICALS
  async insertVerticalRecord(verticalObj: Vertical): Promise<void> {
    if (this.db.verticalsList.some(v => v.verticalName.toLowerCase() === verticalObj.verticalName.toLowerCase())) {
      throw new Error('Vertical already exists.');
    }
    this.db.verticalsList.push(verticalObj);
    if (!this.db.verticals.includes(verticalObj.verticalName)) {
      this.db.verticals.push(verticalObj.verticalName);
    }
    this.saveDatabase();
  }

  async updateVerticalRecord(verticalObj: Vertical): Promise<void> {
    const idx = this.db.verticalsList.findIndex(v => v.verticalName.toLowerCase() === verticalObj.verticalName.toLowerCase());
    if (idx === -1) {
      throw new Error(`Vertical "${verticalObj.verticalName}" not found.`);
    }
    this.db.verticalsList[idx] = verticalObj;
    this.saveDatabase();

    // Sync Vertical IC update to Supabase
    try {
      if (verticalObj.ic && verticalObj.ic.length) {
        const { error } = await this.supabase.client.from(TABLE).update({ ic: verticalObj.ic[0] }).eq('bu_name', verticalObj.verticalName);
        if (error) console.warn('Supabase vertical update error:', error.message);
        else console.log('Synced Vertical updates to Supabase.');
      }
    } catch (e: any) {
      console.warn('Failed to sync Vertical update to Supabase:', e.message);
    }
  }

  async upsertVerticalRecord(verticalObj: Vertical): Promise<'inserted' | 'updated'> {
    const matchKey = verticalObj.verticalName.toLowerCase();
    if (this.db.verticalsList.some(v => v.verticalName.toLowerCase() === matchKey)) {
      await this.updateVerticalRecord(verticalObj);
      return 'updated';
    } else {
      await this.insertVerticalRecord(verticalObj);
      return 'inserted';
    }
  }
}
