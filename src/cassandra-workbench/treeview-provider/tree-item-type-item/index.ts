import * as vscode from "vscode";
import { Icons } from "../../../icons";
import { CassandraType, TreeItemType } from "../../../types";
import { TreeItemBase } from "../tree-item-base";

export class TreeItemTypeItem extends TreeItemBase {
    public type: TreeItemType = "type_item";
    constructor(
        public label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public clusterIndex: number,
        public keyspace: string,
        public contextValue: string,
        public typeData: CassandraType,
        public tooltipText?: string,
    ) {
        super(label, collapsibleState);

        this.iconPath = Icons.get(this.type);
        this.tooltip = tooltipText;
    }

}
