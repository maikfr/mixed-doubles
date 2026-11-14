import type { OnDestroy } from '@angular/core';
import { Directive, ElementRef, NgZone, afterNextRender, inject } from '@angular/core';

@Directive({ selector: 'section[appFitProjection]', standalone: true })
export class FitProjectionDirective implements OnDestroy {
  private readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly zone = inject(NgZone);
  private resize?: ResizeObserver;
  private mutations?: MutationObserver;
  private frame = 0;
  private readonly schedule = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const container = this.element.parentElement;
      if (!container) return;
      const height = this.element.scrollHeight;
      const width = this.element.scrollWidth;
      if (!height || !width) return;
      const availableHeight = Math.max(1, window.innerHeight - 24);
      const availableWidth = container.clientWidth;
      if (!availableWidth) return;
      const scale = Math.min(1, availableHeight / height, availableWidth / width);
      this.element.style.transform = `scale(${scale})`;
      container.style.height = `${Math.ceil(height * scale)}px`;
    });
  };

  constructor() {
    afterNextRender(() => this.initialize());
  }

  private initialize(): void {
    this.zone.runOutsideAngular(() => {
      this.resize = new ResizeObserver(this.schedule);
      this.resize.observe(this.element);
      if (this.element.parentElement) this.resize.observe(this.element.parentElement);
      this.mutations = new MutationObserver(this.schedule);
      this.mutations.observe(this.element, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['open'],
      });
      window.addEventListener('resize', this.schedule);
      this.schedule();
    });
  }
  ngOnDestroy(): void {
    this.resize?.disconnect();
    this.mutations?.disconnect();
    window.removeEventListener('resize', this.schedule);
    cancelAnimationFrame(this.frame);
  }
}
