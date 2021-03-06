export type RuleType =
    "syntax" |
    "syntaxBracket" |
    "syntaxOperator" |
    "special" |
    "keyword" |
    "dataType" |
    "inputKeyspace" |
    "inputTable" |
    "inputMaterializedView" |
    "inputColumn" |
    "inputType" |
    "inputAggregate" |
    "inputFunction" |
    "inputIndex" |
    "inputBaseColumn" |
    "inputBaseKeyspace" |
    "inputBaseTable" |
    "inputConstant";

export interface RuleData {
    text: string;
    type: RuleType;
}

export interface PreferredRules {
    [key: string]: RuleData;
}

export const preferredRules: PreferredRules = {

    "column": { text: "", type: "inputColumn" },
    "keyspace": { text: "", type: "inputKeyspace" },
    "table": { text: "", type: "inputTable" },
    "type": { text: "", type: "inputType" },
    "materializedView": { text: "", type: "inputMaterializedView" },
    "aggregate": { text: "", type: "inputAggregate" },
    "function": { text: "", type: "inputFunction" },
    "index": { text: "", type: "inputIndex" },
    "baseColumn": { text: "", type: "inputBaseColumn" },
    "baseKeyspace": { text: "", type: "inputBaseKeyspace" },
    "baseTable": { text: "", type: "inputBaseTable" },
    "constant": { text: "", type: "inputConstant" },

    "syntaxBracketLr": { text: "(", type: "syntaxBracket" },
    "syntaxBracketRr": { text: ")", type: "syntaxBracket" },
    "syntaxBracketLc": { text: "{", type: "syntaxBracket" },
    "syntaxBracketRc": { text: "}", type: "syntaxBracket" },
    "syntaxBracketLa": { text: "<", type: "syntaxBracket" },
    "syntaxBracketRa": { text: ">", type: "syntaxBracket" },
    "syntaxBracketLs": { text: "[", type: "syntaxBracket" },
    "syntaxBracketRs": { text: "]", type: "syntaxBracket" },

    "syntaxComma": { text: ",", type: "syntax" },
    "syntaxSquote": { text: "'", type: "syntax" },
    "syntaxDquote": { text: "\"", type: "syntax" },

    "specialStar": { text: "*", type: "special" },

    "syntaxOperatorEq": { text: "=", type: "syntaxOperator" },
    "syntaxOperatorLt": { text: "<", type: "syntaxOperator" },
    "syntaxOperatorGt": { text: ">", type: "syntaxOperator" },
    "syntaxOperatorLte": { text: "<=", type: "syntaxOperator" },
    "syntaxOperatorGte": { text: ">=", type: "syntaxOperator" },

    "kwAdd": { text: "ADD", type: "keyword" },
    "kwAggregate": { text: "AGGREGATE", type: "keyword" },
    "kwAll": { text: "ALL", type: "keyword" },
    "kwAllKeyspaces": { text: "ALL KEYSPACES", type: "keyword" },
    "kwAllRoles": { text: "ALL ROLES", type: "keyword" },
    "kwAllowFiltering": { text: "ALLOW FILTERING", type: "keyword" },
    "kwAllPermissions": { text: "ALL PERMISSIONS", type: "keyword" },
    "kwAllow": { text: "ALLOW", type: "keyword" },
    "kwAlter": { text: "ALTER", type: "keyword" },
    "kwAnd": { text: "AND", type: "keyword" },
    "kwApply": { text: "APPLY", type: "keyword" },
    "kwAs": { text: "AS", type: "keyword" },
    "kwAsc": { text: "ASC", type: "keyword" },
    "kwAuthorize": { text: "AUTHORIZE", type: "keyword" },
    "kwBatch": { text: "BATCH", type: "keyword" },
    "kwBegin": { text: "BEGIN", type: "keyword" },
    "kwBy": { text: "BY", type: "keyword" },
    "kwCalled": { text: "CALLED", type: "keyword" },
    "kwClustering": { text: "CLUSTERING", type: "keyword" },
    "kwCompact": { text: "COMPACT", type: "keyword" },
    "kwContains": { text: "CONTAINS", type: "keyword" },
    "kwContainsKey": { text: "CONTAINS KEY", type: "keyword" },
    "kwCreate": { text: "CREATE", type: "keyword" },
    "kwDelete": { text: "DELETE", type: "keyword" },
    "kwDesc": { text: "DESC", type: "keyword" },
    "kwDescibe": { text: "DESCRIBE", type: "keyword" },
    "kwDistinct": { text: "DISTINCT", type: "keyword" },
    "kwDrop": { text: "DROP", type: "keyword" },
    "kwDurableWrites": { text: "DURABLE_WRITES", type: "keyword" },
    "kwEntries": { text: "ENTRIES", type: "keyword" },
    "kwExecute": { text: "EXECUTE", type: "keyword" },
    "kwExists": { text: "EXISTS", type: "keyword" },
    "kwFiltering": { text: "FILTERING", type: "keyword" },
    "kwFinalfunc": { text: "FINALFUNC", type: "keyword" },
    "kwFrom": { text: "FROM", type: "keyword" },
    "kwFull": { text: "FULL", type: "keyword" },
    "kwFunction": { text: "FUNCTION", type: "keyword" },
    "kwFunctions": { text: "FUNCTIONS", type: "keyword" },
    "kwGrant": { text: "GRANT", type: "keyword" },
    "kwIf": { text: "IF", type: "keyword" },
    "kwIn": { text: "IN", type: "keyword" },
    "kwIndex": { text: "INDEX", type: "keyword" },
    "kwInitcond": { text: "INITCOND", type: "keyword" },
    "kwInput": { text: "INPUT", type: "keyword" },
    "kwInsertInto": { text: "INSERT INTO", type: "keyword" },
    // "kwInsert": { text: "INSERT", type: "keyword" },
    // "kwInto": { text: "INTO", type: "keyword" },
    "kwIs": { text: "IS", type: "keyword" },
    "kwKey": { text: "KEY", type: "keyword" },
    "kwKeys": { text: "KEYS", type: "keyword" },
    "kwKeyspace": { text: "KEYSPACE", type: "keyword" },

    "kwLanguage": { text: "LANGUAGE", type: "keyword" },
    "kwLimit": { text: "LIMIT", type: "keyword" },
    "kwList": { text: "LIST", type: "keyword" },
    "kwListRoles": { text: "LIST ROLES", type: "keyword" },
    "kwListUsers": { text: "LIST USERS", type: "keyword" },
    "kwLogged": { text: "LOGGED", type: "keyword" },
    "kwLogin": { text: "LOGIN", type: "keyword" },
    // "kwMaterialized": { text: "MATERIALIZED", type: "keyword" },
    "kwMaterializedView": { text: "MATERIALIZED VIEW", type: "keyword" },
    "kwModify": { text: "MODIFY", type: "keyword" },
    "kwNosuperuser": { text: "NOSUPERUSER", type: "keyword" },
    "kwNorecursive": { text: "NORECURSIVE", type: "keyword" },
    "kwNot": { text: "NOT", type: "keyword" },
    "kwNull": { text: "NULL", type: "keyword" },
    "kwOf": { text: "OF", type: "keyword" },
    "kwOn": { text: "ON", type: "keyword" },
    "kwOptions": { text: "OPTIONS", type: "keyword" },
    "kwOr": { text: "OR", type: "keyword" },
    "kwOrder": { text: "ORDER", type: "keyword" },
    "kwOrderBy": { text: "ORDER BY", type: "keyword" },
    "kwPassword": { text: "PASSWORD", type: "keyword" },
    "kwPrimary": { text: "PRIMARY", type: "keyword" },
    "kwRename": { text: "RENAME", type: "keyword" },
    "kwReplace": { text: "REPLACE", type: "keyword" },
    "kwReplication": { text: "REPLICATION", type: "keyword" },
    "kwReturns": { text: "RETURNS", type: "keyword" },
    "kwRole": { text: "ROLE", type: "keyword" },

    "kwSelect": { text: "SELECT", type: "keyword" },
    "kwSet": { text: "SET", type: "keyword" },
    "kwSfunc": { text: "SFUNC", type: "keyword" },
    "kwStatic": { text: "STATIC", type: "keyword" },
    "kwStorage": { text: "STORAGE", type: "keyword" },
    "kwStype": { text: "STYPE", type: "keyword" },
    "kwSuperuser ": { text: "SUPERUSER", type: "keyword" },
    "kwTable": { text: "TABLE", type: "keyword" },
    "kwTimestamp": { text: "TIMESTAMP", type: "keyword" },
    "kwTo": { text: "TO", type: "keyword" },
    "kwToken": { text: "TOKEN", type: "keyword" },
    "kwTrigger": { text: "TRIGGER", type: "keyword" },
    "kwTruncate": { text: "TRUNCATE", type: "keyword" },
    "kwTtl": { text: "TTL", type: "keyword" },
    "kwType": { text: "TYPE", type: "keyword" },
    "kwUnlogged": { text: "UNLOGGED", type: "keyword" },
    "kwUpdate": { text: "UPDATE", type: "keyword" },
    "kwUse": { text: "USE", type: "keyword" },
    "kwUser": { text: "USER", type: "keyword" },
    "kwUsers": { text: "USERS", type: "keyword" },
    "kwUsing": { text: "USING", type: "keyword" },
    "kwValues": { text: "VALUES", type: "keyword" },
    // "kwView": { text: "VIEW", type: "keyword" },
    "kwWhere": { text: "WHERE", type: "keyword" },
    "kwWith": { text: "WITH", type: "keyword" },
    "kwRevoke": { text: "REVOKE", type: "keyword" },

    "dataTypeAscii": { text: "ASCII", type: "dataType" },
    "dataTypeBigint": { text: "BIGINT", type: "dataType" },
    "dataTypeBlob": { text: "BLOB", type: "dataType" },
    "dataTypeBoolean": { text: "BOOLEAN", type: "dataType" },
    "dataTypeCounter": { text: "COUNTER", type: "dataType" },
    "dataTypeDate": { text: "DATE", type: "dataType" },
    "dataTypeDecimal": { text: "DECIMAL", type: "dataType" },
    "dataTypeDouble": { text: "DOUBLE", type: "dataType" },
    "dataTypeFloat": { text: "FLOAT", type: "dataType" },
    "dataTypeFrozen": { text: "FROZEN", type: "dataType" },
    "dataTypeInet": { text: "INET", type: "dataType" },
    "dataTypeInt": { text: "INT", type: "dataType" },
    "dataTypeList": { text: "LIST", type: "dataType" },
    "dataTypeMap": { text: "MAP", type: "dataType" },
    "dataTypeSmallInt": { text: "SMALLINT", type: "dataType" },
    "dataTypeSet": { text: "SET", type: "dataType" },
    "dataTypeText": { text: "TEXT", type: "dataType" },
    "dataTypeTime": { text: "TIME", type: "dataType" },
    "dataTypeTimeUuid": { text: "TIMEUUID", type: "dataType" },
    "dataTypeTimestamp": { text: "TIMESTAMP", type: "dataType" },
    "dataTypeTinyInt": { text: "TINYINT", type: "dataType" },
    "dataTypeTuple": { text: "TUPLE", type: "dataType" },
    // "dataTypeUserDefined": { text: "", type: "dataType" },
    "dataTypeUuid": { text: "UUID", type: "dataType" },
    "dataTypeVarChar": { text: "VARCHAR", type: "dataType" },
    "dataTypeVarInt": { text: "VARINT", type: "dataType" },
};
