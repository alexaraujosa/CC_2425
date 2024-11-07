# Computer Communication Project

**Group:** idfk
            P.S. Me Neither

a104257, Alex Araújo de Sá, alexaraujosa  
a96268, Paulo Alexandre Rodrigues Ferreira, Pauloarf  
a104271, Rafael Santos Fernandes, DarkenLM  

## Setup
To setup the environment, run the shell script present on `scripts/prepare.sh`. It should setup all needed tools to use within this project. Afterwards, run the command `pnpm install`, and the project should be fully configured.

## Dependencies
To ensure the project database is set up correctly, follow these steps:

1. **Install MongoDB Server**:  
   Download and install MongoDB Server from [this link](https://www.mongodb.com/try/download/community) (last checked on 07/11/2024).

2. **Start MongoDB Server**:  
   - **On Linux**: Run `sudo systemctl start mongod` to start the MongoDB service.
   - **On Windows**: Refer to MongoDB's [official documentation](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-windows/) for service setup and start instructions.

3. **Create a MongoDB Connection**:  
   We used MongoDB Compass to manage the database. Download it [here](https://www.mongodb.com/try/download/compass) (last checked on 07/11/2024).

4. **Update Connection URL in Code**:  
   In `databaseDAO.ts`, change the `MONGO_URL` variable to reflect your connection string if needed.

5. **Database Creation**:  
   After configuration, a database called `CCDatabase` will be created automatically when the project connects for the first time.

> _Note:_ Setting up MongoDB in the CORE environment was challenging and remains partially unresolved.
>
> _TL;DR:_ we'fucked.

## Documentation
This project automatically generates the API documentation for both the Server and Agent solutions by running the command `pnpm run docs` (note that `pnpm docs` would not work in this case, as it is a primitive command for pnpm), nd can be found on `docs/api`.  
The documentation generation is powered by [Typedoc](https://typedoc.org).

## VSCode Debugging
There are four debugger configurations included: `Debug Current File (TSX)`, `Debug Agent Solution (TSX)`, `Debug Server Solution (TSX)` and `Debug Server + Agent`. Their name describes their targets, and `(TSX)` indicates that [TSX](https://tsx.is) is used as the runtime.

## Recommended Extensions
This project contains a set of extensions that are required for the development workflow to work. VSCode marks them as "recommended", but they are absolutely mandatory.

<img src="./docs/repo/gun.png" alt="I'm gonna sue you out of existence." width="400"/>