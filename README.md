
<p align="left">
<img src="https://raw.githubusercontent.com/kdcro101/vscode-cassandra/master/media/title.png" title="Cassandra workbench for Visual Studio Code" alt="Cassandra workbench for Visual Studio Code">
</p>

[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/version/kdcro101.vscode-cassandra.svg)](https://marketplace.visualstudio.com/items?itemName=kdcro101.vscode-cassandra)
[![Installs](https://vsmarketplacebadge.apphb.com/installs-short/kdcro101.vscode-cassandra.svg)](https://marketplace.visualstudio.com/items?itemName=kdcro101.vscode-cassandra)
[![Rating](https://vsmarketplacebadge.apphb.com/rating-short/kdcro101.vscode-cassandra.svg)](https://marketplace.visualstudio.com/items?itemName=kdcro101.vscode-cassandra#review-details)
[![Build Status](https://travis-ci.com/kdcro101/vscode-cassandra.svg?branch=master)](https://travis-ci.com/kdcro101/vscode-cassandra)


Design and query Apache Cassandra database with help of generated templates, autocomplete and inline code decorations. 
Supports Apache Cassandra versions **`2.*`** and **`3.*`**

<p align="center">
   <img src="https://raw.githubusercontent.com/kdcro101/vscode-cassandra/master/media/res/cover.png" />
</p>

 - [Quick start](#quick-start)
 - [Editor UI](#editor-ui)
 - [Limitations](#limitations)
 - [Key bindings](#key-bindings)
 - [Configuration](#configuration)
 - [Workspace configuration](#workspace-configuration)

## Quick start


<p align="center">
   <img src="https://raw.githubusercontent.com/kdcro101/vscode-cassandra/master/media/res/panel-and-settings.png?image1" />
</p>

Open **workspace** (workspace path is needed for configuration to generate), activate extension by running command from palette `Cassandra Workbench: Generate configuration`. This will generate `.cassandraWorkbench.jsonc` configuration file.

Switch to `Cassandra worbench` panel by clicking activity bar icon.
Edit `.cassandraWorkbench.jsonc` to suit your needs. ([configuration](#configuration))

## Editor UI

<p align="center">
   <img src="https://raw.githubusercontent.com/kdcro101/vscode-cassandra/master/media/res/editor-ui.png?image766ssad" />
</p>

## Limitations

Multiple `SELECT` statements per script are not allowed. You will be notified by message:
```
Unable to execute multiple SELECT statements
```

Mixing `SELECT` statements with data/structure altering statements is not allowed.  You will be notified by message: 
```
Unable to execute SELECT statement along with data or structure altering statements
```


## Key bindings


| Binding        |                       |
| ------------- |------------------------|
| `CTRL+ALT+F`  | Find in script         |
| `CTRL+ALT+H`  | Replace in script      |
| `CTRL+A`      | Select all |
| `CTRL+ENTER`  | Execute script |

## Configuration
`.cassandraWorkbench.jsonc` file contains array of cluster connection items. 

Authentication modes, currently supported ([more info](https://docs.datastax.com/en/cassandra/3.0/cassandra/configuration/secureConfigNativeAuth.html)):
- AllowAllAuthenticator
- PasswordAuthenticator

When using `PasswordAuthenticator`, **user**, used to connect, must have **`SELECT`** permissions to access:
- Cassandra 3.*
    - `system_schema` keyspace 
- Cassandra 2.* 
    - `system.schema_aggregates`
    - `system.schema_columnfamilies`
    - `system.schema_columns`
    - `system.schema_functions`
    - `system.schema_keyspaces`
    - `system.schema_triggers`
    - `system.schema_usertypes`
   
Default configuration (generated by `Cassandra Workbench: Generate configuration`):
```ts
// name must be unique!
[
    // AllowAllAuthenticator
    {
        "name": "Cluster AllowAllAuthenticator",
        "contactPoints": ["127.0.0.1"]
    },
    //PasswordAuthenticator
    {
        "name": "Cluster PasswordAuthenticator",
        "contactPoints": ["127.0.0.1"],
        "authProvider": {
            "class": "PasswordAuthenticator",
            "username": "yourUsername",
            "password": "yourPassword"
        }
    }
]

```

Add/remove and reconfigure cluster items as needed. 



## Workspace configuration
`cassandraWorkbench.excludeKeyspaces`: `string[]` - default `[]`
- list of regexp pattern to exclude when listing keyspaces in panel

To exclude `system` keyspaces use:
```ts
    "cassandraWorkbench.excludeKeyspaces": [
            "^system$",
            "^system_auth$",
            "^system_distributed$",
            "^system_traces$",
            "^system_schema$"
        ]
```

`cassandraWorkbench.useWorkspace` : `number` - default `0`
- index of workspace where to look for configuration file `.cassandraWorkbench.jsonc`. For multi-root only.

