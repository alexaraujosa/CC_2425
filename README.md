# Computer Communication Project

**Group:** idfk
            P.S. Me Neither

a104257, Alex Araújo de Sá, alexaraujosa  
a96268, Paulo Alexandre Rodrigues Ferreira, Pauloarf  
a104271, Rafael Santos Fernandes, DarkenLM  

## Setup
To setup the environment, run the shell script present on `scripts/prepare.sh`. It should setup all needed tools to use within this project. Afterwards, run the command `pnpm install`, and the project should be fully configured.

## Documentation
This project automatically generates the API documentation for both the Server and Agent solutions by running the command `pnpm run docs` (note that `pnpm docs` would not work in this case, as it is a primitive command for pnpm), nd can be found on `docs/api`.  
The documentation generation is powered by [Typedoc](https://typedoc.org).

## VSCode Debugging
There are four debugger configurations included: `Debug Current File (TSX)`, `Debug Agent Solution (TSX)`, `Debug Server Solution (TSX)` and `Debug Server + Agent`. Their name describes their targets, and `(TSX)` indicates that [TSX](https://tsx.is) is used as the runtime.

## Recommended Extensions
This project contains a set of extensions that are required for the development workflow to work. VSCode marks them as "recommended", but they are absolutely mandatory.

<img src="./docs/repo/gun.png" alt="I'm gonna sue you out of existence." width="400"/>