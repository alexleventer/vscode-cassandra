import {
    ChangeDetectionStrategy, ChangeDetectorRef, Component,
    ElementRef, HostListener, Input, OnDestroy, OnInit, ViewChild,
} from "@angular/core";
import { MatMenu, MatMenuTrigger } from "@angular/material";
import beautify from "json-beautify";
import { cloneDeep, concat } from "lodash-es";
import ResizeObserver from "resize-observer-polyfill";
import { fromEvent, merge, of, ReplaySubject, Subject } from "rxjs";
import { concatMap, debounceTime, filter, take, takeUntil, tap } from "rxjs/operators";
import { ColumnInfo } from "../../../../../../src/cassandra-client/index";
import { CassandraColumn, CassandraMaterializedView, CassandraTable, DataChangeItem } from "../../../../../../src/types/index";
import { AnalyzedStatement, CqlAnalysis } from "../../../../../../src/types/parser";
import { ViewDestroyable } from "../../../base/view-destroyable";
import { generateId } from "../../../const/id";
import { DataChangeService } from "../../../services/data-change/data-change.service";
import { ThemeService } from "../../../services/theme/theme.service";
import { WorkbenchEditor } from "../../../types/index";
import { gridElementAnimations } from "./animations";
import { onBeforeChange } from "./before-change";
import { CellClassManager } from "./cell-class/cell-class";
import { ChangeManager } from "./change-manager";
import { buildColumns } from "./column-builder/column-builder";
import { contexMenuHandler, ContextMenuCommand } from "./context-commands";
import { HtmlCache } from "./html-cache/html-cache";
import { measureText } from "./measure-width";
import { headerRenderer } from "./renderers/header-renderer";
import { ResultState } from "./resultset-state";
import { buildResultState } from "./resultset-state/index";
import { ScrollAssist } from "./scroll-assist/scroll-assist";
import { SelectionHelper } from "./selection-helper/selection-helper";

import SheetClip from "sheetclip";
import { plugins } from "src/app/types/handsontable-new";

const ARROW_DOWN = 40;
const ARROW_UP = 38;
const ARROW_LEFT = 37;
const ARROW_RIGHT = 39;
const PAGE_UP = 33;
const PAGE_DOWN = 34;

interface CellPosition {
    col: number;
    row: number;
}

interface CellCoord {
    row: number;
    col: number;
}

declare var window: any;

@Component({
    selector: "ui-data-grid",
    templateUrl: "./ui-data-grid.component.html",
    styleUrls: ["./ui-data-grid.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [
        ...gridElementAnimations,
    ],
})
export class UiDataGridComponent extends ViewDestroyable implements OnInit, OnDestroy {
    @ViewChild("root") public root: ElementRef<HTMLDivElement>;
    @ViewChild("gridHost") public gridHost: ElementRef<HTMLDivElement>;
    @ViewChild("gridWrap") public gridWrap: ElementRef<HTMLDivElement>;
    @ViewChild("menuTriggerElem") menuTriggerElem: ElementRef<HTMLDivElement>;
    @ViewChild(MatMenuTrigger) menuTrigger: MatMenuTrigger;
    @ViewChild("menu") contextMenu: MatMenu;

    public clipboardCache = "";
    public sheetclip = new SheetClip();

    public gridAnimationState: string;
    public gridInstance: Handsontable = null;
    public gridInstanceId: string = `grid_${generateId()}`;
    private gridSettings: Handsontable.GridSettings = null;

    private gridWrapRect: ClientRect;
    private gridWrapResizeObservable: ResizeObserver;

    public gridScroll: HTMLDivElement;
    private gridScrollHeader: HTMLDivElement;
    private gridScrollContent: HTMLTableElement;
    private gridScrollContentObserver: ResizeObserver;
    private gridScrollHeaderSpacer: HTMLDivElement;
    private gridScrollContentSpacer: HTMLDivElement;

    private stateViewReady = new ReplaySubject<void>(1);

    public eventGridWrapResize = new Subject<void>();

    public cellActive: CellCoord = { col: -1, row: -1 };

    public currentSelectedRows: number[] = [];

    public currentClusterName: string;
    public currentKeyspace: string;
    public currentEditor: WorkbenchEditor = null;
    public currentDataRows: any[] = null;
    public currentAnalysis: CqlAnalysis = null;
    public currentColumns: ColumnInfo[] = null;
    public currentStatementIndex: number = -1;
    public currentStatement: AnalyzedStatement = null;
    public currentTableStruct: CassandraTable | CassandraMaterializedView = null;
    public currentError: Error = null;
    public currentPrimaryKeyAvailable: boolean = false;
    public currentResultState: ResultState = {};

    private eventHeaderCellElement = new Subject<[number, HTMLTableHeaderCellElement]>();
    private stateGridReady = new ReplaySubject<void>(1);

    public changeManager: ChangeManager = null;
    public scrollAssist: ScrollAssist;
    public cellClassManager: CellClassManager;
    public htmlCache = new HtmlCache();

    public selectionActive: boolean = false;
    public eventRender: Subject<void>;
    public eventDestroy: Subject<void>;
    public eventModifyColumnWidth = new Subject<void>();
    public eventScroll = new Subject<void>();
    public renderingProgress = false;
    public selectionHelper: SelectionHelper;

    constructor(
        public host: ElementRef<HTMLDivElement>,
        public change: ChangeDetectorRef,
        public theme: ThemeService,
        public dataChange: DataChangeService,
    ) {
        super(change);

        window.UiDataGridComponent = this;
        this.cellClassManager = new CellClassManager(this);
        this.selectionHelper = new SelectionHelper(this);

        this.gridAnimationState = "hidden";

        this.dataChange.eventProgress.pipe(
            takeUntil(this.eventViewDestroyed),
        ).subscribe((progress) => {
            if (progress.success) {
                this.changeManager.remove(progress.item.id);
            }
            if (progress.success && progress.item.type === "rowDelete") {
                this.removeDataRow(progress.item);
            }

            this.detectChanges();
        });

    }
    @HostListener("@gridAnimationState.done", ["$event"])
    private onGridAnimationEnd(event: AnimationEvent) {

    }
    @Input("editor") set setData(data: WorkbenchEditor) {
        if (data == null) {
            // console.log("UiDataGridComponent -> ̣No data");
            return;
        }
        this.currentEditor = data;
        this.createGridInstance();
    }
    ngOnInit() {
        this.stateViewReady.next();
        this.gridWrapRect = this.host.nativeElement.getBoundingClientRect();

        this.gridWrapResizeObservable = new ResizeObserver(() => {
            // console.log("gridWrap Resize");
            this.gridWrapRect = this.gridWrap.nativeElement.getBoundingClientRect();
            this.eventGridWrapResize.next();
        });
        this.gridWrapResizeObservable.observe(this.gridWrap.nativeElement);

        this.eventGridWrapResize.pipe(
            takeUntil(this.eventViewDestroyed),
            debounceTime(33),
            filter(() => this.gridInstance != null),
        ).subscribe(() => {
            this.gridInstance.updateSettings({
                height: this.gridWrapRect.height,
            }, false);
        });

        ChangeManager.eventChange.pipe(
            takeUntil(this.eventViewDestroyed),
        ).subscribe(() => {

            this.currentResultState.showChanges = this.changeManager.list.length === 0 ? false : true;
            this.detectChanges();
        });

        ChangeManager.eventAdd.pipe(
            takeUntil(this.eventViewDestroyed),
        ).subscribe((item) => this.onDataChangeAdded(item));

        ChangeManager.eventRemove.pipe(
            takeUntil(this.eventViewDestroyed),
        ).subscribe((item) => this.onDataChangeRemoved(item));

        merge(ChangeManager.eventRemove, ChangeManager.eventChange)
            .pipe(
                takeUntil(this.eventViewDestroyed),
                debounceTime(300),
            ).subscribe((item) => {
                this.gridInstance.render();
                this.detectChanges();
            });

    }
    ngOnDestroy() {
        super.ngOnDestroy();
    }
    private onDataChangeAdded(item: DataChangeItem) {
        // console.log(`onDataChangeAdded`);

        switch (item.type) {
            case "cellUpdate":
                const colName = item.column;
                const colIndex = this.currentColumns.findIndex((c) => c.name === colName);
                this.gridInstance.setCellMeta(item.row, colIndex, "className", "changed");
                break;
            case "rowDelete":
                this.currentColumns.forEach((c, i) => {
                    this.gridInstance.setCellMeta(item.row, i, "className", "changed");
                });
                break;
        }

    }
    private onDataChangeRemoved(item: DataChangeItem) {
        // console.log(`onDataChangeRemoved`);
        switch (item.type) {
            case "cellUpdate":
                const colName = item.column;
                const colIndex = this.currentColumns.findIndex((c) => c.name === colName);
                this.gridInstance.setCellMeta(item.row, colIndex, "className", "");
                break;

            case "rowDelete":
                this.currentColumns.forEach((c, i) => {
                    this.gridInstance.setCellMeta(item.row, i, "className", "");
                });
                break;
        }

    }
    private tableData(keyspace: string, tableOrView: string, analysis: CqlAnalysis): CassandraTable | CassandraMaterializedView {
        const refs = analysis.references;

        try {
            const data = refs.objects[keyspace]["tables"][tableOrView];
            if (data) {
                return data;
            }
        } catch (e) { }
        try {
            const data = refs.objects[keyspace]["views"][tableOrView];
            if (data) {
                return data;
            }
        } catch (e) { }

        return null;
    }
    private createGridInstance() {

        this.currentError = null;
        this.stateGridReady = new ReplaySubject<void>(1);
        this.eventRender = new Subject<void>();
        this.currentPrimaryKeyAvailable = false;
        this.gridAnimationState = "hidden";
        this.htmlCache = new HtmlCache();

        this.detectChanges();

        this.eventRender.pipe(
            takeUntil(this.eventViewDestroyed),
            debounceTime(300),
            take(1),
        ).subscribe(() => {
            console.log("##################################");
            console.log("RENDERING DONE");
            console.log("##################################");
            this.gridInstance.updateSettings({}, false);
            this.stateGridReady.next();
            this.gridAnimationState = "ready";
            this.renderingProgress = false;
            this.gridScroll = document.querySelectorAll(`#${this.gridInstanceId} .wtHolder`)[0] as HTMLDivElement;
            this.gridScrollHeader = document.querySelectorAll(`#${this.gridInstanceId} .wtHolder`)[1] as HTMLDivElement;
            this.gridScrollContent = document.querySelectorAll(`#${this.gridInstanceId} table.htCore`)[0] as HTMLTableElement;
            this.gridScrollHeaderSpacer = document.createElement("div");
            this.gridScrollContentSpacer = document.createElement("div");
            this.gridScrollHeaderSpacer.classList.add("added-spacer-header");
            this.gridScrollContentSpacer.classList.add("added-spacer-content");
            this.gridScrollContent.appendChild(this.gridScrollContentSpacer);
            this.gridScrollHeader.insertBefore(this.gridScrollHeaderSpacer, this.gridScrollHeader.children[0]);
            // this.gridScrollHeader.appendChild(this.gridScrollHeaderSpacer);
            this.scrollAssist = new ScrollAssist(this);

            this.gridScrollContentObserver = new ResizeObserver(() => {
                // console.log("content ResizeObserver");
                setTimeout(() => this.fixContentWidth());
            });
            this.gridScrollContentObserver.observe(this.gridScrollContent);

            this.detectChanges();
        });

        this.stateViewReady.pipe(
            take(1),
            tap(() => {
                if (this.gridInstance) {
                    console.log(this.gridInstance);
                    try {
                        this.gridInstance.destroy();
                        this.gridInstance = null;
                    } catch (e) {
                        return;
                    }
                }
            }),
        ).subscribe(() => {
            // console.log("createGridInstance");
            const data = this.currentEditor.result;

            // this.currentStatementIndex = data.analysis.statements.findIndex((s) => s.type === "select");
            this.currentStatementIndex = data.analysis.statements.reduce((acc, cur, i) => {
                if (cur.hasResultset === true) {
                    acc = i;
                    return acc;
                }
                return acc;
            }, -1);

            if (this.currentStatementIndex < 0) {
                return;
            }

            const error = data.errors[this.currentStatementIndex];

            if (error) {
                // console.log("Statement resulted in error");
                // console.log(error.error);
                this.currentError = error.error;
                this.renderingProgress = false;
                this.currentResultState = { showError: true };
                this.detectChanges();
                return;
            }

            this.renderingProgress = true;
            this.detectChanges();

            const result = data.results[this.currentStatementIndex];
            const analysis = data.analysis;
            const columns = data.columns[this.currentStatementIndex].list;
            const types = columns.reduce((acc, curr) => {
                acc[curr.name] = curr.type;
                return acc;
            }, {});

            this.currentColumns = columns;
            this.currentAnalysis = analysis;
            this.currentStatement = analysis.statements[this.currentStatementIndex];

            // TODO
            // this.currentTableStruct = analysis.references.objects[this.currentStatement.keyspace]["tables"][this.currentStatement.table];
            this.currentTableStruct = this.tableData(this.currentStatement.keyspace, this.currentStatement.table, analysis);

            this.currentPrimaryKeyAvailable = this.primaryKeyAvailable();
            this.currentClusterName = analysis.cluserName;
            this.currentKeyspace = this.currentStatement.keyspace;
            // handle set/map/custom - stringify
            this.currentDataRows = cloneDeep(result.result.rows).slice(0).map((row) => {
                Object.keys(row).forEach((k) => {
                    if (types[k] === "set" || types[k] === "map" || types[k] === "custom" || types[k] === "tuple") {
                        // row[k] = JSON.stringify(row[k]);
                        row[k] = beautify(row[k], null, 2);
                    }
                });
                return row;
            });

            this.changeManager = new ChangeManager(this);

            const columnDef = buildColumns(this);

            this.gridSettings = {
                data: this.currentDataRows,
                minSpareCols: 0,
                minSpareRows: 0,
                rowHeaders: true,
                copyPaste: true,
                // contextMenu: gridContextMenu(this),
                contextMenu: false,
                colHeaders: headerRenderer(this.currentColumns, this.currentTableStruct),
                columns: columnDef,
                allowRemoveColumn: false,
                allowRemoveRow: false,
                allowInsertColumn: false,
                allowInsertRow: false,
                afterGetColHeader: (col: number, th: HTMLTableHeaderCellElement) => this.eventHeaderCellElement.next([col, th]),
                manualColumnResize: true,
                manualRowResize: true,
                beforeKeyDown: this.onBeforeKeydown,
                selectionMode: "multiple",
                columnSorting: true,
                fillHandle: false,
                sortIndicator: true,
                autoColumnSize: true,
                // autoRowSize: { syncLimit: 10 },
                autoRowSize: false,
                beforeChange: onBeforeChange(this),
                afterSelection: this.onAfterSelection,
                afterSelectionEnd: this.onAfterSelectionEnd,
                afterOnCellMouseDown: this.onCellMouseDown,
                viewportColumnRenderingOffset: 255,
                viewportRowRenderingOffset: 5,
                beforeOnCellMouseOver: this.onBeforeOnCellMouseOver,
                outsideClickDeselects: false,
                undo: true,
                afterRender: (isForced: boolean) => {
                    // console.log(`afterRender ${isForced}`);
                    this.eventRender.next();
                },
                afterDestroy: () => { this.eventDestroy.next(); },
                // afterUpdateSettings: () => { console.log("afterUpdateSettings"); },
                afterScrollHorizontally: () => this.eventScroll.next(),
                afterScrollVertically: () => this.eventScroll.next(),
                afterCopy: (changes) => {
                    // console.log("afterCopy");
                    this.clipboardCache = this.sheetclip.stringify(changes);
                },
                afterCut: (changes) => {
                    // console.log("afterCut");
                    this.clipboardCache = this.sheetclip.stringify(changes);
                },
                afterPaste: (changes) => {
                    // console.log("afterPaste");
                    this.clipboardCache = this.sheetclip.stringify(changes);
                },
                beforeColumnSort: (column: number, order: plugins.SortOrderType) => {
                    if (this.htmlCache) {
                         this.htmlCache.clear();
                    }
                    return true;
                },

            };

            this.gridInstance = new Handsontable(this.gridHost.nativeElement, this.gridSettings);

            this.gridInstance.addHook("modifyColWidth", (width: number, col: number) => {

                if (col < 0) {
                    return width;
                }

                const c = this.currentColumns[col];
                const m = measureText(c.name) + 48;
                const max = this.gridWrapRect.width;
                let w = width;
                if (m > width) {
                    w = m;
                }
                if (w > max) {
                    w = max;
                }
                this.eventModifyColumnWidth.next();

                return w;
            });

            this.currentResultState = buildResultState(this);

            // autoremove readonly notification
            if (this.currentResultState.showReadonly) {
                setTimeout(() => {
                    this.currentResultState.showReadonly = false;
                    this.detectChanges();
                }, 4000);
            }

            this.eventModifyColumnWidth.pipe(
                takeUntil(this.eventViewDestroyed),
                debounceTime(100),
            ).subscribe(() => {
                this.fixContentWidth();
            });

            fromEvent<MouseEvent>(this.gridWrap.nativeElement, "mousedown", { capture: false }).pipe(
                takeUntil(this.eventViewDestroyed),
                tap((e) => {
                    if (e.button === 0 && this.menuTrigger.menuOpen) {
                        this.menuTrigger.closeMenu();
                    }
                }),
                filter((e) => e.button === 2),
            ).subscribe((e) => {
                // console.log("mousedown on gridwrapper");
                this.menuOpen(e);
            });

            fromEvent<KeyboardEvent>(this.gridHost.nativeElement, "keypress", { capture: true }).pipe(
                takeUntil(this.eventViewDestroyed),
                filter((e) => e.ctrlKey && e.key === "a"),
            ).subscribe(() => {
                console.log("grid select all");
                this.gridInstance.selectCell(0, 0, this.gridInstance.countRows() - 1, this.gridInstance.countCols() - 1);

            });

        });

    }

    private onBeforeKeydown = (e: KeyboardEvent) => {
        const ranges = this.gridInstance.getSelected();
        // [startRow, startCol, endRow, endCol];

        if (ranges == null || ranges.length === 0) {
            return;
        }

        const first = ranges[0];

        const startRow = first[0];
        const startCol = first[1];
        const endRow = first[2];
        const endCol = first[3];

        const normalized = this.normalizeSelection(startRow, startCol, endRow, endCol);

        const nStartRow = normalized[0].row;
        const nStartCol = normalized[0].col;
        const nEndRow = normalized[1].row;
        const nEndCol = normalized[1].col;

        const maxCol = this.gridInstance.countSourceCols() - 1;
        const maxRow = this.gridInstance.countSourceRows() - 1;

        const shift = e.shiftKey;
        const keyCode = e.keyCode;

        // console.log(JSON.stringify(first));

        const selectedAll = nStartRow === 0 && nStartCol === 0 && nEndRow === maxRow && nEndCol === maxCol;

        const pageRowSize = this.gridInstance.countVisibleRows();
        // console.log("NORM: " + JSON.stringify(normalized));

        // console.log(`maxCol=${maxCol} maxRow=${maxRow} selectedAll=${selectedAll}`);

        // if ((keyCode === ARROW_LEFT || keyCode === ARROW_UP || keyCode === PAGE_UP) && selectedAll && !shift) {
        if ((keyCode === ARROW_LEFT || keyCode === ARROW_UP) && selectedAll && !shift) {
            this.gridInstance.selectCell(0, 0, 0, 0, false);
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }

        // if ((keyCode === ARROW_RIGHT || keyCode === ARROW_DOWN || keyCode === PAGE_DOWN) && selectedAll && !shift) {
        if ((keyCode === ARROW_RIGHT || keyCode === ARROW_DOWN) && selectedAll && !shift) {
            this.gridInstance.selectCell(maxRow, maxCol, maxRow, maxCol, false);
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }

        if ((keyCode === ARROW_DOWN) && nEndRow === maxRow) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        if ((keyCode === ARROW_UP) && nStartRow === 0) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        if (keyCode === ARROW_LEFT && nStartCol === 0) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        if (keyCode === ARROW_RIGHT && nEndCol === maxCol) {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }

        // PAGEUP/DOWN
        const downRowDiff = maxRow - nEndRow;
        if (!shift && keyCode === PAGE_DOWN && downRowDiff < pageRowSize) {
            // got to maxRow
            this.gridInstance.selectCell(maxRow, startCol, maxRow, endCol, false);
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }
        const upRowDiff = nStartRow - pageRowSize;
        if (!shift && keyCode === PAGE_UP && upRowDiff < 0) {
            // got to maxRow
            this.gridInstance.selectCell(0, startCol, 0, endCol, false);
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }

    }

    private normalizeSelection(startRow: number, startCol: number, endRow: number, endCol: number): CellPosition[] {
        const p1: CellPosition = {
            col: startCol,
            row: startRow,
        };
        const p2: CellPosition = {
            col: endCol,
            row: endRow,
        };
        const list = [p1, p2];

        const sorted = list.sort(function (a, b) {
            if (a.col === b.col) { return a.row - b.row; }
            return a.col - b.col;
        });
        return sorted;
    }

    private primaryKeyAvailable(): boolean {
        if (!this.currentTableStruct) {
            return false;
        }
        const keys = this.currentTableStruct.primaryKeys;
        const cols = this.currentColumns;
        const collected: CassandraColumn[] = [];

        keys.forEach((k, i) => {
            const f = cols.find((c) => c.name === k.name);
            if (f) {
                collected.push(k);
            }
        });

        if (collected.length === keys.length) {
            return true;
        }
        return false;
    }
    private getHeaderElement(col: number): Promise<HTMLTableHeaderCellElement> {
        return new Promise((resolve, reject) => {

            this.eventHeaderCellElement.pipe(
                take(1),
                filter((data) => data[0] === col),
            ).subscribe((data) => {
                resolve(data[1]);
            }, (e) => {
                reject(e);
            });

            const c = this.gridInstance.getColHeader(col);

        });
    }
    private onCellMouseDown = (event: MouseEvent, coords: CellCoord, TD: Element): void => {

        this.cellActive.col = coords.col;
        this.cellActive.row = coords.row;

    }

    public onAfterSelection = (r: number, c: number, r2: number, c2: number, preventScrolling: object, selectionLayerLevel: number) => {
        if (this.selectionActive === false) {
            this.selectionActive = true;
        }
    }
    public onBeforeOnCellMouseOver = (event: Event, coords: Handsontable.wot.CellCoords, TD: Element, blockCalculations: object) => {

    }
    public onAfterSelectionEnd = (r: number, c: number, r2: number, c2: number, selectionLayerLevel: number): void => {
        this.selectionActive = false;
        this.currentSelectedRows = this.selectionHelper.getRows(this.gridInstance.getSelected());
        // console.log(JSON.stringify(this.currentSelectedRows));
    }

    private fixContentWidth() {
        if (!this.gridScrollContent) {
            return;
        }
        // console.log("fixContentWidth");
        let added = Math.round(this.gridWrapRect.width / 4);
        added = added >= 100 ? added : 100;

        this.gridScrollContentSpacer.style.height = `0.1px`;
        this.gridScrollHeaderSpacer.style.height = `0.1px`;

        const rect = this.gridScrollContent.getBoundingClientRect();

        this.gridScrollContentSpacer.style.width = `${rect.width + added}px`;
        this.gridScrollHeaderSpacer.style.width = `${rect.width + added}px`;

    }
    public scrollDisable() {
        if (!this.gridScroll) {
            return;
        }
        // console.log("scrollDisable");
        this.gridScroll.style.overflow = "hidden";
        this.gridScroll.style["willChange"] = "transform";
    }
    public scrollEnable() {
        if (!this.gridScroll) {
            return;
        }
        // console.log("scrollEnable");
        this.gridScroll.style.overflow = "auto";
        this.gridScroll.style["willChange"] = "unset";
    }
    public changesDiscard = () => {
        this.changeManager.clear();
    }
    public changesCommit = () => {
        const items = this.changeManager.list;
        this.dataChange.commit(items);
    }

    public changeCancel(item: DataChangeItem) {
        if (item.type === "rowDelete") {
            return;
        }
        const colIndex = this.currentColumns.findIndex((c) => c.name === item.column);
        this.htmlCache.invalidate(item.row, colIndex);
        this.currentDataRows[item.row][item.column] = item.valueOld;
        this.gridInstance.render();
    }
    private removeDataRow(item: DataChangeItem) {
        const row = item.row;

        this.currentDataRows.splice(row, 1);

        // invalidate html cache
        this.currentColumns.forEach((c, i) => {
            this.htmlCache.invalidate(row, i);
        });

        this.detectChanges();
        this.gridInstance.render();
    }

    public menuOpen(ev: MouseEvent) {
        // ev.preventDefault();
        // ev.stopImmediatePropagation();
        // ev.stopPropagation();

        of(this.menuTrigger.menuOpen).pipe(
            concatMap((opened) => {
                if (!opened) {
                    return Promise.resolve();
                }
                return new Promise<void>((resolve, reject) => {
                    this.contextMenu._animationDone
                        .pipe(filter(event => event.toState === "void"), take(1))
                        .subscribe(() => {
                            resolve();
                        }, (err) => {
                            resolve();
                        });

                    this.menuTrigger.closeMenu();
                });
            }),
        ).subscribe(() => {

            const e = this.gridWrap.nativeElement;
            const r = e.getBoundingClientRect();
            const w = this.menuTriggerElem.nativeElement;
            const t = this.menuTrigger;
            const x = ev.clientX - r.left;
            const y = ev.clientY - r.top;

            w.style.left = `${x + 1}px`;
            w.style.top = `${y + 1}px`;

            t.openMenu(); // Open your custom context menu instead

        });

    }
    public onContextMenu = (command: ContextMenuCommand) => {
        contexMenuHandler(this, command);
    }
}
