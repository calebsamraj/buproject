import { Component, Input, Output, EventEmitter, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multi-select.component.html',
  styleUrls: ['./multi-select.component.css']
})
export class MultiSelectComponent implements OnInit {
  @Input() label: string = '';
  @Input() options: string[] = [];
  @Input() placeholder: string = 'Search...';
  @Input() emptyText: string = 'No matches';
  @Input() loading: boolean = false;
  @Input() failed: boolean = false;

  @Input() selectedValues: string[] = [];
  @Output() selectedValuesChange = new EventEmitter<string[]>();
  @Output() retry = new EventEmitter<void>();

  isOpen: boolean = false;
  searchTerm: string = '';

  constructor(private elementRef: ElementRef) {}

  ngOnInit() {}

  get filteredOptions(): string[] {
    if (!this.searchTerm) return this.options;
    const term = this.searchTerm.toLowerCase();
    return this.options.filter(o => o && String(o).toLowerCase().includes(term));
  }

  get triggerText(): string {
    if (this.selectedValues.length === 0) {
      return this.label ? `Select ${this.label}...` : 'All';
    } else if (this.selectedValues.length === 1) {
      return this.selectedValues[0];
    } else {
      return `${this.selectedValues.length} Selected`;
    }
  }

  get isAllSelected(): boolean {
    const opts = this.filteredOptions;
    if (opts.length === 0) return false;
    return opts.every(o => this.selectedValues.includes(o));
  }

  get isIndeterminate(): boolean {
    const opts = this.filteredOptions;
    const selectedCount = opts.filter(o => this.selectedValues.includes(o)).length;
    return selectedCount > 0 && selectedCount < opts.length;
  }

  toggleOpen(event: Event) {
    event.stopPropagation();
    if (!this.isOpen) {
      // Close other open multi-select panels
      document.querySelectorAll('.multiselect.open').forEach(el => {
        el.classList.remove('open');
      });
    }
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      setTimeout(() => {
        const searchInput = this.elementRef.nativeElement.querySelector('.ms-search input');
        if (searchInput) searchInput.focus();
      }, 50);
    }
  }

  clearSelection(event: Event) {
    event.stopPropagation();
    this.selectedValues = [];
    this.selectedValuesChange.emit(this.selectedValues);
  }

  onOptionToggle(option: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.selectedValues.includes(option)) {
        this.selectedValues = [...this.selectedValues, option];
      }
    } else {
      this.selectedValues = this.selectedValues.filter(v => v !== option);
    }
    this.selectedValuesChange.emit(this.selectedValues);
  }

  onSelectAllToggle(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const opts = this.filteredOptions;
    if (checked) {
      const newSelected = [...this.selectedValues];
      opts.forEach(o => {
        if (!newSelected.includes(o)) {
          newSelected.push(o);
        }
      });
      this.selectedValues = newSelected;
    } else {
      this.selectedValues = this.selectedValues.filter(o => !opts.includes(o));
    }
    this.selectedValuesChange.emit(this.selectedValues);
  }

  onRetryClick(event: Event) {
    event.stopPropagation();
    this.retry.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.isOpen = false;
  }
}
