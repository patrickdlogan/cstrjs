/**
 * Class for system-wide behavior. Variables whose formulas are currently demanding the value of another variable are
 * found on the demandingVariables stack during the sweep phase of the lazy mark-and-sweep dependency management.
 * Daemons in the daemon queue are executed prior to sweeping out-of-date formulas when getting the current value of a
 * variable.
 */
class ConstraintSystem {

    // TODO: decide whether or not to have a class or just non-exported variables in the module

    constructor() {
        /**
         *
         * @type {!Array<!Variable>}
         */
        this.demandingVariables = [];
        this.daemonQueue = [];
        this.executingDaemons = null;
    }

    /**
     * Add the given daemon to the end of the system's daemonQueue.
     * @param {!function(): void} daemon - a thunk executed only for side-effects
     */
    addDaemon(daemon) {
        this.daemonQueue.push(daemon);
    }

    /**
     * Execute the daemons on the daemonQueue. Daemons are removed from the daemonQueue once executed,
     */
    executeDaemons() {
        if (this.daemonQueue.length > 0 && this.executingDaemons === null) {
            this.executingDaemons = this.daemonQueue;
            this.daemonQueue = [];
            this.executingDaemons.forEach(daemon => { daemon(); });
            this.executingDaemons = null;
        }
    }
}

/**
 * Class for maintaining a reference from one variable to a second variable where the formula of the second variable
 * depends on the value of the first. The dependency captures the "tick" as of when the dependency is established.
 * Comparing the current tick of the second variable to the tick of the Dependency instance determines whether or not
 * the dependency is out of date.
 */
class Dependency {
    /**
     *
     * @param {!Variable} variable
     */
    constructor(variable) {
        this.variable = variable;
        this.tick = this.variable.tick + 1;
    }

    get outOfDate() {
        return this.tick < this.variable.tick;
    }

    /**
     * This method provides the mark phase of the mark-and-sweep dependency system.
     * Mark this and all transitive dependents out of date if they are not already marked.
     * @param {!Array<!Variable>} marked
     */
    mark(marked) {
        this.variable.mark(marked);
    }
}

class Variable {
    /**
     * The Variable is initialized with the given value. A non-null formula will be used to compute the returned value
     * instead of the initialized value. Circular references to the formula use the initialized value instead of going
     * in circles. A non-null outOfDateDaemon is executed during the mark phase just prior to marking dirty the
     * formulas that depend on this variable. Formulas and daemons that are non-arrow functions have "this" bound to
     * thisFormula.
     * @param {?} value
     * @param {?function(): ?} formula
     * @param {?} thisFormula
     * @param {?function(): void} outOfDateDaemon
     */
    constructor({value = null, formula = null, thisFormula = null, outOfDateDaemon = null} = {}) {
        /**
         * @private
         * @type {*}
         */
        this._value = value;
        /**
         * @private
         * @type {?(function(): *)}
         */
        this._formula = formula;
        /**
         * @private
         * @type {*}
         */
        this._thisFormula = thisFormula;
        /**
         * @private
         * @type {?(function(): void)}
         */
        this._outOfDateDaemon = outOfDateDaemon;
        this.tick = 0;
        /**
         * @private
         * @type {boolean}
         */
        this._outOfDate = formula !== null;
        /**
         * @private
         * @type {!Array<!Dependency>}
         */
        this._dependents = [];
    }

    /**
     * The value of the receiver may be computed by a formula. Out of date formulas may demand values of other variables
     * Any system-wide daemons are executed first whether the variable is a formula or an explicit value.
     * @return {?} - the value of the receiver, possibly computed using a formula
     */
    get value() {
        system.executeDaemons();
        this.sweep();
        return this._value;
    }

    /**
     * Peek at the current value of the receiver without computing a formula.
     * @return {?}
     */
    peek() {
        return this._value;
    }

    /**
     * Set the explicit value of the receiver. If the receiver previously had a formula compute its value then remove
     * the formula and the outOfDateDaemon. Mark the receiver as not out of date but mark its dependents as out of date.
     * The mark phase executes the outOfDateDaemons of the receiver's dependents.
     * @param {?} value
     */
    set value(value) {
        this._value = value;
        this._formula = null;
        this._outOfDateDaemon = null;
        this.mark();
        this._outOfDate = false;
    }

    /**
     * Mark the reciver's dependents as out-of-date. Mark the receiver as up-to-date with the given value as the current
     * value. Any outOfDateDaemons for the receiver and dependents are executed as with any other mark phase.
     * @param {?} value
     */
    set formulaValue(value) {
        this._value = value;
        this.mark();
        this._outOfDate = false;
    }

    /**
     * Set or replace the formula of the receiver. Retain the receiver's outOfDateDaemon. Mark the receiver and its
     * dependents as out of date, executing any outOfDateDaemons in the receiver and dependents. Circular references to
     * the formula use the receiver's current value instead of going in circles.
     * @param {!function(): ?} formula
     */
    set formula(formula) {
        this._formula = formula;
        this.mark();
    }

    // TODO: setter for outOfDateDaemon and setter for thisFormula

    /**
     * @param {?} thisFormula
     */
    set thisFormula(thisFormula) {
        this._thisFormula = thisFormula;
    }

    /**
     * Set the outOfDateDaemon to a possibly null function.
     * @param {?function(): void} daemon
     */
    set outOfDateDaemon(daemon) {
        this._outOfDateDaemon = daemon;
    }

    /**
     * @return {!Variable}
     */
    copy() {
        if (this._formula === null) {
            return new Variable({value: this._value});
        } else {
            return new Variable({
                value: this._value,
                formula: this._formula,
                thisFormula: this._thisFormula,
                outOfDateDaemon: this._outOfDateDaemon
            });
        }
    }

    /**
     * @protected
     * @param {?Array<!Variable>} marked
     */
    mark(marked = null) {
        const markedVariables = (marked === null) ? [] : marked;
        if (!this._outOfDate && !markedVariables.includes(this)) {
            markedVariables.push(this);
            this._outOfDate = true;
            this.executeOutOfDateDaemon();
            const removals = [];
            this._dependents.forEach(dep => {
                if (dep.outOfDate) {
                    removals.push(dep);
                } else {
                    dep.mark(markedVariables);
                }
            });
            removals.forEach(dep => {
                const pos = this._dependents.indexOf(dep);
                this._dependents.splice(pos, 1);
            });
            markedVariables.pop();
        }
    }

    /**
     * @private
     * @return {void}
     */
    executeOutOfDateDaemon() {
        if (this._outOfDateDaemon !== null) {
            const boundDaemon = this._outOfDateDaemon.bind(this._thisFormula);
            boundDaemon();
        }
    }

    /**
     * @private
     * @return {void}
     */
    sweep() {
        this.updateDependencies();
        this.computeFormula();
    }

    /**
     * If there is a variable at the top of the system's demanding variables then add or update it as a dependent of the
     * receiver.
     * @private
     * @return {void}
     */
    updateDependencies() {
        if (system.demandingVariables.length > 0) {
            const demandingVariable = system.demandingVariables[system.demandingVariables.length - 1];
            const dep = this._dependents.find(dependent => dependent.variable === demandingVariable);
            if (dep === undefined) {
                this._dependents.push(new Dependency(demandingVariable));
            } else {
                dep.tick = demandingVariable.tick + 1;
            }
        }
    }

    /**
     * If the receiver has an out of date formula then compute the formula with this variable on top of the system's
     * demanding variables.
     * @private
     * @return {void}
     */
    computeFormula() {
        if (this._outOfDate) {
            system.demandingVariables.push(this);
            this._outOfDate = false;
            const boundFormula = this._formula.bind(this._thisFormula);
            this._value = boundFormula();
            this.tick++;
            system.demandingVariables.pop();
        }
    }
}

/**
 * Add a daemon to the system to be executed once, at the start of the next call to get the value of any Variable
 * instance. After the first and only execution the daemon must be added again to execute another time.
 * @param {!function(): void} daemon
 */
function addDaemon(daemon) {
    system.addDaemon(daemon);
}

const system = new ConstraintSystem();

export { Variable, addDaemon };
