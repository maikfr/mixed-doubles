import type { OnDestroy } from '@angular/core';
import { Directive, ElementRef, NgZone, afterNextRender, inject } from '@angular/core';

/** Keep every table intact, fitting its full intrinsic width inside its container. */
@Directive({ selector: 'table[appFitTable]', standalone: true })
export class FitTableDirective implements OnDestroy {
  private readonly table = inject(ElementRef<HTMLTableElement>).nativeElement;
  private readonly zone = inject(NgZone);
  private observer?: ResizeObserver;
  private frame = 0;

  constructor() {
    afterNextRender(() => this.initialize());
  }

  private initialize(): void {
    this.zone.runOutsideAngular(() => {
      const container = this.table.parentElement;
      if (!container) return;
      container.classList.add('fit-table-container');
      this.table.classList.add('fit-table');
      const schedule = (): void => {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => {
          const available = container.clientWidth;
          const width = this.table.offsetWidth;
          if (!available || !width) return;
          const scale = Math.min(1, available / width);
          const transform = `scale(${scale})`;
          const height = `${Math.ceil(this.table.offsetHeight * scale)}px`;
          if (this.table.style.transform !== transform) this.table.style.transform = transform;
          if (container.style.height !== height) container.style.height = height;
        });
      };
      this.observer = new ResizeObserver(schedule);
      this.observer.observe(container);
      this.observer.observe(this.table);
      schedule();
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
  }
}
