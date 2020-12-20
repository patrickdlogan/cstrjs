import { Variable, addDaemon } from '../cstr.mjs';
import test from 'tape';

test('simplest test', function (t) {
    t.plan(1);
    const variable = new Variable({value: 10});
    t.equal(10, variable.value);
});

test('out-of-date daemon executes whenever its variable is marked out of date', function(t) {
    let n = 0;
    const x = new Variable({value: 0});
    const y = new Variable({
        value: 0,
        formula: function() { return 10 * x.value; },
        outOfDateDaemon: function() { n++; }
    });
    t.equals(x.value, 0);
    t.equals(y.value, 0);
    t.equals(n, 0);
    x.value = 1;
    t.equals(n, 1);
    t.equals(x.value, 1);
    t.equals(y.value, 10);
    x.value = 2;
    t.equals(n, 2);
    t.equals(x.value, 2);
    t.equals(y.value, 20);
    t.end();
});

test('system daemon executes once and only once upon access of the next variable value', function(t) {
    let n = 0;
    addDaemon(function() { n++; });
    const x = new Variable({value: 0});
    const y = new Variable({
        value: 0,
        formula: function() { return 10 * x.value; }
    });
    t.equals(n, 0);
    t.equals(x.value, 0);
    t.equals(n, 1);
    t.equals(y.value, 0);
    x.value = 1;
    t.equals(x.value, 1);
    t.equals(y.value, 10);
    x.value = 2;
    t.equals(x.value, 2);
    t.equals(y.value, 20);
    t.equals(n, 1);
    t.end();
});

test('bind formula "this"', function (t) {
    const n = new Variable({value: 0});
    const evenArray = [];
    const oddArray = [];
    const formula = function() {
        const value = n.value;
        this.push(value);
        n.value = value + 1;
        return value;
    }
    const evens = new Variable({
        formula: formula,
        thisFormula: evenArray
    });
    const odds = new Variable({
        formula: formula,
        thisFormula: oddArray
    });
    t.equal(evens.value, 0);
    t.equal(odds.value, 1);
    t.equal(evens.value, 2);
    t.equal(odds.value, 3);
    t.equal(evens.value, 4);
    t.equal(odds.value, 5);
    t.deepEqual(evenArray, [0, 2, 4]);
    t.deepEqual(oddArray, [1, 3, 5]);
    t.end();
});

test('circular dependencies', function(t) {
    const celsius = new Variable({
        value: 0.0,
        formula: function() {
            return (fahrenheit.value - 32.0) / 1.8;
        }
    });
    const fahrenheit = new Variable({
        value: 32.0,
        formula: function () {
            return (celsius.value * 1.8) + 32.0;
        }
    });
    t.equal(celsius.value, 0.0);
    t.equal(fahrenheit.value, 32.0);
    celsius.formulaValue = 100.0;
    t.equal(fahrenheit.value, 212.0);
    t.equal(celsius.value, 100.0);
    fahrenheit.value = -459.67;
    t.equal(fahrenheit.value, -459.67);
    t.equal(celsius.value, -273.15);
    t.end();
});