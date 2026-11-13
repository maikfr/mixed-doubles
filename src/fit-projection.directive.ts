import type { OnDestroy } from '@angular/core';
import { Directive, ElementRef, NgZone, afterNextRender, inject, input } from '@angular/core';

@Directive({ selector: 'main[appFitProjection]', standalone: true })
export class FitProjectionDirective implements OnDestroy {
  readonly appFitProjection = input(false);
  private readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly zone = inject(NgZone);
  private resize?: ResizeObserver;
  private mutations?: MutationObserver;
  private frame = 0;
  private readonly schedule = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (!this.appFitProjection()) {
        this.element.style.transform = '';
        return;
      }
      const height = this.element.scrollHeight;
      const width = this.element.scrollWidth;
      if (!height || !width) return;
      const availableHeight = Math.max(1, window.innerHeight - this.element.offsetTop);
      const availableWidth = Math.max(1, window.innerWidth - this.element.offsetLeft);
      const scale = Math.min(1, availableHeight / height, availableWidth / width);
      this.element.style.transform = `scale(${scale})`;
    });
  };

  constructor() {
    afterNextRender(() => this.initialize());
  }

  private initialize(): void {
    this.zone.runOutsideAngular(() => {
      this.resize = new ResizeObserver(this.schedule);
      this.resize.observe(this.element);
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
