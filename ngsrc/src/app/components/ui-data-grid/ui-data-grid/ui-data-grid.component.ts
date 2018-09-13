import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from "@angular/core";
import ResizeObserver from "resize-observer-polyfill";
import { ReplaySubject, Subject } from "rxjs";
import { debounceTime, filter, take, takeUntil, tap } from "rxjs/operators";
import { ColumnInfo } from "../../../../../../src/cassandra-client/index";
import { ClusterExecuteResults } from "../../../../../../src/clusters";
import { AnalyzedStatement, CqlAnalysis } from "../../../../../../src/parser/listeners/cql-analyzer";
import { CassandraColumn, CassandraTable } from "../../../../../../src/types/index";
import { ViewDestroyable } from "../../../base/view-destroyable";
import { cellRendererJson } from "./renderers/cell-renderer-json";

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
interface GridColumn {
    data: string;
    type?: string;
}

declare var window: any;

@Component({
    selector: "ui-data-grid",
    templateUrl: "./ui-data-grid.component.html",
    styleUrls: ["./ui-data-grid.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiDataGridComponent extends ViewDestroyable implements OnInit, OnDestroy {
    @ViewChild("root") public root: ElementRef<HTMLDivElement>;
    // QueryExecuteResult
    private gridInstance: Handsontable = null;
    private gridSettings: Handsontable.GridSettings = null;
    private stateReady = new ReplaySubject<void>(1);

    private htmlCache: { [key: string]: HTMLElement } = {};

    private hostResizeObs: ResizeObserver;
    private eventHostResize = new Subject<void>();

    private currentAnalysis: CqlAnalysis = null;
    private currentColumns: ColumnInfo[] = null;
    private currentStatementIndex: number = -1;
    private currentStatement: AnalyzedStatement = null;
    private currentTableStruct: CassandraTable = null;

    public currentError: Error = null;

    // public showError: boolean = false;

    constructor(public host: ElementRef<HTMLDivElement>, public change: ChangeDetectorRef) {
        super(change);
        this.hostResizeObs = new ResizeObserver(() => {
            this.eventHostResize.next();
        });
        this.hostResizeObs.observe(this.host.nativeElement);

        window.UiDataGridComponent = this;
    }
    @Input("queryResult") set setData(data: ClusterExecuteResults) {
        if (data == null) {
            console.log("UiDataGridComponent -> ̣No data");
            return;
        }
        this.createGridInstance(data);
    }
    ngOnInit() {
        this.stateReady.next();

        this.eventHostResize.pipe(
            takeUntil(this.eventViewDestroyed),
            debounceTime(100),
            filter(() => this.gridInstance != null),
        ).subscribe(() => {
            this.gridInstance.updateSettings(this.gridSettings, false);

        });

    }
    ngOnDestroy() {
        super.ngOnDestroy();
    }
    private createGridInstance(data: ClusterExecuteResults) {
        this.currentError = null;
        this.detectChanges();

        console.log("createGridInstance: ClusterExecuteResults");
        console.log("------------------------------------------");
        console.log(data);
        console.log("------------------------------------------");

        this.stateReady.pipe(
            take(1),
            tap(() => {
                if (this.gridInstance) {
                    try {
                        this.gridInstance.destroy();
                        this.gridInstance = null;
                    } catch (e) {
                        console.log(e);
                    }
                }
            }),
        ).subscribe(() => {
            console.log("createGridInstance");
            this.htmlCache = {};

            this.currentStatementIndex = data.analysis.statements.findIndex((s) => s.type === "select");

            if (this.currentStatementIndex < 0) {
                return;
            }

            const error = data.errors[this.currentStatementIndex];

            if (error) {
                console.log("Statement resulted in error");
                console.log(error.error);
                this.currentError = error.error;
                this.detectChanges();
                return;
            }

            const result = data.results[this.currentStatementIndex];
            const analysis = data.analysis;
            const columns = data.columns[this.currentStatementIndex].list;

            this.currentColumns = columns;
            this.currentAnalysis = analysis;
            this.currentStatement = analysis.statements[this.currentStatementIndex];
            this.currentTableStruct = this.currentStatement.tableStruct;

            const types = columns.reduce((acc, curr) => {
                acc[curr.name] = curr.type;
                return acc;
            }, {});

            console.log(types);

            const names = columns.map((c) => c.name);

            // handle set/map/custom - stringify
            const dataRows = result.result.rows.map((row) => {
                Object.keys(row).forEach((k) => {
                    if (types[k] === "set" || types[k] === "map" || types[k] === "custom") {
                        row[k] = JSON.stringify(row[k]);
                    }
                });
                return row;
            });
            // const dataRows = data.rows;
            const columnDef = columns.map((c) => {
                if (c.type === "set" || c.type === "map" || c.type === "custom") {
                    return {
                        data: c.name,
                        renderer: cellRendererJson(this.htmlCache),
                    };

                } else {
                    return {
                        data: c.name,
                        type: "text",
                    };
                }

            });

            this.gridSettings = {
                data: dataRows,
                minSpareCols: 0,
                minSpareRows: 0,
                rowHeaders: true,
                contextMenu: true,
                colHeaders: names,
                columns: columnDef,
                allowRemoveColumn: false,
                allowRemoveRow: false,
                allowInsertColumn: false,
                allowInsertRow: false,
                manualColumnResize: true,
                manualRowResize: true,
                beforeKeyDown: this.onBeforeKeydown,
                selectionMode: "single",
                columnSorting: true,
                fillHandle: false,
                sortIndicator: true,
                // renderAllRows: true,
                // autoColumnSize: {
                //     samplingRatio: 23,
                // },
                autoRowSize: { syncLimit: 10 },
                afterChange: this.onAfterChange,

            };

            this.gridInstance = new Handsontable(this.root.nativeElement, this.gridSettings);
            this.gridInstance.updateSettings({
                cells: this.cellsRenderer,
            }, false);
            // this.gridInstance.render();
        });

    }
    private onAfterChange = (changes: [number, string | number, any, any][], source: string) => {
        console.log(`onAfterChange ${source}`);
        console.log(changes);

        if (source === "edit") {
            console.log("setting meta source===edit");
            const row = changes[0][0];
            const key = changes[0][1];

            const col = ((this.gridSettings.columns as any[]) as GridColumn[]).findIndex((e) => e.data === key);

            if (col < 0) {
                return;
            }
            console.log(`row:${row} col:${col}`);

            this.gridInstance.setCellMeta(row, col, "className", "changed");
            this.gridInstance.render();

        }
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

        // console.log(keyCode);

    }
    private onHostResize() {
        if (this.gridInstance == null) {
            return;
        }
        console.log("onHostResize");
        this.gridInstance.updateSettings(this.gridSettings, false);
    }
    // private cellRendererJson = (instance: _Handsontable.Core,
    //     td: HTMLElement, row: number, col: number, prop: string | number, value: any,
    //     cellProperties: Handsontable.GridSettings): void => {

    //     const obj = JSON.parse(value);

    //     RenderJson.set_icons("+", "-");
    //     Handsontable.dom.empty(td);

    //     const key = `R${row}C${col}`;
    //     const cache = this.htmlCache[key];
    //     let element: HTMLElement = null;

    //     if (cache == null) {
    //         element = RenderJson.render(obj, () => {
    //             this.gridInstance.deselectCell();
    //             this.gridInstance.selectCell(row, col);
    //         });
    //         this.htmlCache[key] = element;
    //     } else {
    //         element = cache;
    //     }

    //     td.appendChild(element);

    // }
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
    private cellsRenderer = (row?: number, col?: number, prop?: object | number | string): Handsontable.GridSettings => {

        // console.log(`cellsRenderer row=${row} col=${col} prop=${JSON.stringify(prop)}`);

        if (col >= 0 && row >= 0 && this.currentTableStruct) {
            const name = prop as string;
            const pkc = this.currentTableStruct.primaryKeys.find((k) => k.name === name);
            if (pkc && pkc.kind === "partition_key") {
                const pkcs: Handsontable.GridSettings = {
                    className: "cell-key-partition",
                    readOnly: true,
                };

                return pkcs;
            }
            if (pkc && pkc.kind === "clustering") {
                const pkcs: Handsontable.GridSettings = {
                    className: "cell-key-column-clustering",
                    readOnly: true,
                };
                return pkcs;
            }

            // no primary key - everything is readonly
            if (!this.primaryKeyAvailable()) {
                return {
                    readOnly: true,
                };
            }
        }

        return {};
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
}
