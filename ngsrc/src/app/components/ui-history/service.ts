import { Overlay, OverlayConfig, OverlayRef } from "@angular/cdk/overlay";
import { ComponentPortal } from "@angular/cdk/portal";
import { Injectable, NgZone } from "@angular/core";
import { fromEvent, Subject } from "rxjs";
import { concatMap, filter, take, takeUntil, tap } from "rxjs/operators";
import { UiHistoryComponent } from "./ui-history/ui-history.component";

const ESCAPE_KEYCODE = 27;

@Injectable({
    providedIn: "root",
})
export class UiHistoryService {
    protected overlayRef: OverlayRef = null;
    private component: UiHistoryComponent = null;

    public eventClosed = new Subject<void>();
    public terminate = new Subject<void>();
    public eventCommand = new Subject<string>();
    constructor(public overlay: Overlay, public zone: NgZone) {
        this.terminate.pipe(
            concatMap(() => this.component.hide()),
            concatMap(() => this.close()),
        ).subscribe(() => {
            console.info("UiHistoryService terminate.done");
        });
    }
    public show() {

        Promise.all([
            this.close(),
        ]).then(() => {
            this.zone.run(() => {

                const config = new OverlayConfig();
                config.hasBackdrop = true;
                // config.backdropClass = "backdrop-animated";

                UiHistoryComponent.service = this;
                config.positionStrategy = this.overlay.position()
                    .global().height("70%").width("100%").bottom("0");

                this.overlayRef = this.overlay.create(config);
                this.component = this.overlayRef.attach(new ComponentPortal(UiHistoryComponent, null)).instance;

                this.component.eventAnimation.pipe(
                    take(1),
                    filter((s) => s === "active"),
                ).subscribe(() => {

                    this.overlayRef.keydownEvents().pipe(
                        takeUntil(this.eventClosed),
                        filter((e) => e.keyCode === ESCAPE_KEYCODE),
                    ).subscribe(() => {
                        this.terminate.next();
                    });

                    fromEvent<MouseEvent>(this.overlayRef.backdropElement, "mousedown").pipe(
                        takeUntil(this.eventClosed),
                        filter((e) => e.button === 0),
                        take(1),
                    ).subscribe((e) => {
                        this.terminate.next();
                    });

                });

            });
        }).catch((e) => {
            console.log(e);
        });
    }
    public close() {
        return new Promise((resolve, reject) => {

            if (this.overlayRef == null) {
                resolve();
                return;
            }

            this.eventClosed.next();
            this.zone.run(() => {
                this.overlayRef.detach();
                this.overlayRef = null;
                this.component = null;
                resolve();
            });
        });
    }

}