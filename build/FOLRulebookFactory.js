var FOLRulebookFactory = (function () {
    function FOLRulebookFactory(debug) {
        var _this = this;
        if (debug === void 0) { debug = function () { }; }
        this.debug = debug;
        this.rules = {
            "premise": {
                Name: "Premise",
                Type: "simple",
                SimpleVerifier: new Justifier(null, function (proof, step) { return true; })
            },
            "assumption": {
                Name: "Assumption",
                Type: "simple",
                SimpleVerifier: new Justifier(null, function (proof, step) {
                    if (proof.steps[step].isFirstStmt())
                        return true;
                    return "Assumptions can only be made at the start of an assumption box.";
                })
            },
            "lem": {
                Name: "LEM",
                Type: "derived",
                SimpleVerifier: new Justifier(null, function (proof, step) {
                    var s = proof.steps[step].getSentence();
                    if (s[0] !== "or")
                        return "LEM: must be phi or not phi.";
                    var left = s[1], right = s[2];
                    if (right[0] !== "not" || !_this.semanticEq(left, right[1]))
                        return "LEM: right side must be negation of left.";
                    return true;
                })
            },
            "copy": {
                Name: "COPY",
                Type: "derived",
                SimpleVerifier: new Justifier({ StepRefs: ["num"] }, function (proof, step, part, steps) {
                    var curStep = proof.steps[step].getSentence();
                    var refStep = proof.steps[steps[0]].getSentence();
                    if (!this.semanticEq(curStep, refStep))
                        return "Copy: Current step is not semantically equal to the referenced step.";
                    return true;
                })
            },
            "mt": {
                Name: "MT",
                Type: "derived",
                SimpleVerifier: new Justifier({ StepRefs: ["num", "num"] }, function (proof, step, part, steps) {
                    var impStep = proof.steps[steps[0]].getSentence();
                    if (impStep[0] !== "->")
                        return "MT: 1st referenced step must be implication.";
                    var left = impStep[1], right = impStep[2];
                    var negStep = proof.steps[steps[1]].getSentence();
                    if (negStep[0] !== "not" || !this.semanticEq(negStep[1], right))
                        return "MT: 2nd ref step must be negation of right side of 1st ref step.";
                    var s = proof.steps[step].getSentence();
                    if (s[0] !== 'not' || !this.semanticEq(left, s[1]))
                        return "MT: current step must be negation of left side of ref step.";
                    return true;
                })
            },
            "pbc": {
                Name: "PBC",
                Type: "derived",
                SimpleVerifier: new Justifier({ HasPart: false, StepRefs: ["range"], Substitution: false }, function (proof, step, part, steps) {
                    var assumptionExpr = proof.steps[steps[0][0]].getSentence();
                    var contraExpr = proof.steps[steps[0][1]].getSentence();
                    if (!this.isContradiction(contraExpr)) {
                        return "PBC: Final step in range must be a contradiction.";
                    }
                    if (assumptionExpr[0] !== 'not')
                        return "PBC: Assumption is not a negation. Might you be thinking of not-introduction?";
                    var semEq = this.semanticEq(assumptionExpr[1], proof.steps[step].getSentence());
                    if (semEq)
                        return true;
                    return "PBC: Negation of assumption doesn't match current step.";
                })
            },
            "contra": {
                Name: "Contradiction",
                Type: "normal",
                ElimVerifier: new Justifier({ HasPart: false, StepRefs: ["num"], Substitution: false }, function (proof, step, part, steps) {
                    var refStep = proof.steps[steps[0]].getSentence();
                    if (refStep[0] != 'id' || (refStep[1] != 'contradiction' && refStep[1] != '_|_'))
                        return "Contra-elim: Referenced step is not a contradiction.";
                    return true;
                })
            },
            "notnot": {
                Name: "Double-negation",
                Type: "normal",
                ElimVerifier: new Justifier({ HasPart: false, StepRefs: ["num"], Substitution: false }, function (proof, step, part, steps) {
                    var curStep = proof.steps[step].getSentence();
                    var refStep = proof.steps[steps[0]].getSentence();
                    if (refStep[0] !== 'not' || refStep[1][0] !== 'not')
                        return "Notnot-elim: Referenced step is not a double-negation.";
                    if (!this.semanticEq(refStep[1][1], curStep))
                        return "Notnot-elim: Does not result in current step.";
                    return true;
                })
            },
            "->": {
                Name: "Implication",
                Type: "normal",
                IntroVerifier: new Justifier({ HasPart: false, StepRefs: ["range"], Substitution: false }, function (proof, step, part, steps) {
                    var truth = proof.steps[steps[0][0]].getSentence();
                    var result = proof.steps[steps[0][1]].getSentence();
                    var implies = proof.steps[step].getSentence();
                    if (implies[0] != '->')
                        return "Implies-Intro: Current step is not an implication";
                    var truthSemEq = this.semanticEq(implies[1], truth);
                    if (!truthSemEq)
                        return "Implies-Intro: The left side does not match the assumption.";
                    var resultSemEq = this.semanticEq(implies[2], result);
                    if (!resultSemEq)
                        return "Implies-Intro: The result does not match the right side.";
                    return true;
                }),
                ElimVerifier: new Justifier({ HasPart: false, StepRefs: ["num", "num"], Substitution: false }, function (proof, step, part, steps) {
                    var truthStep = steps[1], impliesStep = steps[0];
                    if (truthStep >= step || impliesStep >= step)
                        return "Implies-Elim: Referenced proof steps must precede current step.";
                    var truth = proof.steps[truthStep].getSentence();
                    var implies = proof.steps[impliesStep].getSentence();
                    if (implies[0] != '->')
                        return "Implies-Elim: Step " + steps[0] + " is not an implication";
                    var truthSemEq = this.semanticEq(implies[1], truth);
                    var resultSemEq = this.semanticEq(implies[2], proof.steps[step].getSentence());
                    if (truthSemEq) {
                        if (resultSemEq) {
                            return true;
                        }
                        else {
                            return "Implies-Elim: The left side does not imply this result.";
                        }
                    }
                    return "Implies-Elim: The implication's left side does not match the referenced step.";
                })
            },
            "and": {
                Name: "And",
                Type: "normal",
                IntroVerifier: new Justifier({ StepRefs: ["num", "num"] }, function (proof, step, part, steps) {
                    var s = proof.steps[step].getSentence();
                    if (s[0] !== 'and')
                        return "And-Intro: Current step is not an 'and'-expression." + proof.steps[step].getSentence();
                    if (this.semanticEq(s[1], proof.steps[steps[0]].getSentence())) {
                        if (this.semanticEq(s[2], proof.steps[steps[1]].getSentence())) {
                            return true;
                        }
                        else {
                            return "And-Intro: Right side doesn't match referenced step.";
                        }
                    }
                    return "And-Intro: Left side doesn't match referenced step.";
                }),
                ElimVerifier: new Justifier({ HasPart: true, StepRefs: ["num"] }, function (proof, step, part, steps) {
                    var andExp = proof.steps[steps[0]].getSentence();
                    if (andExp[0] != 'and')
                        return "And-Elim: Referenced step is not an 'and' expression.";
                    var semEq = this.semanticEq(andExp[part], proof.steps[step].getSentence());
                    if (semEq)
                        return true;
                    return "And-Elim: In referenced line, side " + part + " does not match current step.";
                })
            },
            "or": {
                Name: "Or",
                Type: "normal",
                IntroVerifier: new Justifier({ HasPart: true, StepRefs: ["num"] }, function (proof, step, part, steps) {
                    var s = proof.steps[step].getSentence();
                    if (s[0] !== 'or')
                        return "Or-Intro: Current step is not an 'or'-expression.";
                    if (this.semanticEq(s[part], proof.steps[steps[0]].getSentence()))
                        return true;
                    return "Or-Intro: Side " + part + " doesn't match referenced step.";
                }),
                ElimVerifier: new Justifier({ StepRefs: ["num", "range", "range"] }, function (proof, step, part, steps) {
                    var currStepExpr = proof.steps[step].getSentence();
                    var orStepExpr = proof.steps[steps[0]].getSentence();
                    var a1p1Expr = proof.steps[steps[1][0]].getSentence();
                    var a1p2Expr = proof.steps[steps[1][1]].getSentence();
                    var a2p1Expr = proof.steps[steps[2][0]].getSentence();
                    var a2p2Expr = proof.steps[steps[2][1]].getSentence();
                    if (orStepExpr[0] !== 'or')
                        return "Or-Elim: First referenced step is not an 'or'-expression.";
                    if (!this.semanticEq(orStepExpr[1], a1p1Expr))
                        return "Or-Elim: First range intro doesn't match left side of 'or'.";
                    if (!this.semanticEq(orStepExpr[2], a2p1Expr))
                        return "Or-Elim: Second range range intro doesn't match right side of 'or'.";
                    if (!this.semanticEq(a1p2Expr, a2p2Expr))
                        return "Or-Elim: Step range conclusions don't match.";
                    if (!this.semanticEq(a1p2Expr, currStepExpr))
                        return "Or-Elim: Current step doesn't match step range conclusions.";
                    return true;
                })
            },
            "not": {
                Name: "Not",
                Type: "normal",
                IntroVerifier: new Justifier({ StepRefs: ["range"] }, function (proof, step, part, steps) {
                    var assumptionExpr = proof.steps[steps[0][0]].getSentence();
                    var contraExpr = proof.steps[steps[0][1]].getSentence();
                    if (!this.isContradiction(contraExpr)) {
                        return "Not-Intro: Final step in range must be a contradiction.";
                    }
                    var curStep = proof.steps[step].getSentence();
                    if (curStep[0] !== 'not') {
                        return "Not-Intro: Current step is not a negation. Might you be thinking of PBC?";
                    }
                    else {
                        var semEq = this.semanticEq(assumptionExpr, curStep[1]);
                        if (semEq)
                            return true;
                        return "Not-Intro: Negation of assumption doesn't match current step.";
                    }
                }),
                ElimVerifier: new Justifier({ StepRefs: ["num", "num"] }, function (proof, step, part, steps) {
                    var s = proof.steps[step].getSentence();
                    if (!this.isContradiction(s))
                        return "Not-Elim: Current step is not a contradiction." + proof.steps[step].getSentence();
                    var step1expr = proof.steps[steps[0]].getSentence();
                    var step2expr = proof.steps[steps[1]].getSentence();
                    var semEq;
                    if (step1expr[0] === 'not') {
                        semEq = this.semanticEq(step1expr[1], step2expr);
                    }
                    else if (step2expr[0] === 'not') {
                        semEq = this.semanticEq(step2expr[1], step1expr);
                    }
                    else {
                        return "Not-Elim: Neither referenced proof step is a 'not' expression.";
                    }
                    if (semEq)
                        return true;
                    return "Not-Elim: Subexpression in not-expr does not match other expr.";
                })
            },
            "a.": {
                Name: "ForAll",
                Type: "normal",
                IntroVerifier: new Justifier({ StepRefs: ["range"], Substitution: true }, function (proof, step, part, steps, subst) {
                    var currStep = proof.steps[step];
                    var currExpr = currStep.getSentence();
                    var startStep = proof.steps[steps[0][0]];
                    var startExpr = startStep.getSentence();
                    var scope = startStep.getScope();
                    var endExpr = proof.steps[steps[0][1]].getSentence();
                    if (currExpr[0] !== 'forall')
                        return "All-x-Intro: Current step is not a 'for-all' expression.";
                    if (scope.length == 0 || scope[0] == null)
                        return "All-x-Intro: Not valid without a scoping assumption (e.g., an x0 box).";
                    var scopeVar = scope[scope.length - 1];
                    var found = scope.slice().reverse().reduce(function (a, e) { return a && (e == null || e == subst[1]); }, true);
                    if (!found)
                        return "All-x-intro: Substitution " + subst[1] + " doesn't match scope: " + scope.filter(function (e) { if (e != null)
                            return e; }).join(", ");
                    var endExprSub = this.substitute(endExpr, subst[1], subst[0]);
                    if (this.semanticEq(endExprSub, currExpr[2]))
                        return true;
                    return "All-x-Intro: Last step in range doesn't match current step after " + subst[0] + "/" + subst[1] + ".";
                }),
                ElimVerifier: new Justifier({ StepRefs: ["num"], Substitution: true }, function (proof, step, part, steps, subst) {
                    var currStep = proof.steps[step];
                    var currExpr = currStep.getSentence();
                    var refExpr = proof.steps[steps[0]].getSentence();
                    if (refExpr[0] !== 'forall')
                        return "All-x-Elim: Referenced step is not a for-all expression.";
                    var refExprSub = this.substitute(refExpr[2], subst[0], subst[1]);
                    if (this.semanticEq(refExprSub, currExpr))
                        return true;
                    return "All-x-Elim: Referenced step did not match current step after " + subst[1] + "/" + subst[0] + ".";
                })
            },
            "e.": {
                Name: "Exists",
                Type: "normal",
                IntroVerifier: new Justifier({ StepRefs: ["num"], Substitution: true }, function (proof, step, part, steps, subst) {
                    var currStep = proof.steps[step];
                    var currExpr = currStep.getSentence();
                    var refExpr = proof.steps[steps[0]].getSentence();
                    if (currExpr[0] !== 'exists')
                        return "Exists-x-Intro: Current step is not an 'exists' expression.";
                    var refExprSub = this.substitute(refExpr, subst[1], subst[0]);
                    if (this.semanticEq(refExprSub, currExpr[2]))
                        return true;
                    return "Exists-x-Intro: Referenced step did not match current step after " + subst[1] + "/" + subst[0] + " substitution.";
                }),
                ElimVerifier: new Justifier({ StepRefs: ["num", "range"], Substitution: true }, function (proof, step, part, steps, subst) {
                    var currStep = proof.steps[step];
                    var currExpr = currStep.getSentence();
                    var refExpr = proof.steps[steps[0]].getSentence();
                    var startStep = proof.steps[steps[1][0]];
                    var startExpr = startStep.getSentence();
                    var scope = startStep.getScope();
                    var endExpr = proof.steps[steps[1][1]].getSentence();
                    if (refExpr[0] !== 'exists')
                        return "Exists-x-Elim: Referenced step is not an 'exists' expression.";
                    if (scope.length == 0 || scope[scope.length - 1] == null)
                        return "Exists-x-Elim: Range must be within an assumption scope (e.g., an x0 box).";
                    var scopeVars = scope[scope.length - 1];
                    var refExprSub = this.substitute(refExpr[2], subst[0], subst[1]);
                    if (this.semanticEq(refExprSub, startExpr)) {
                        if (this.semanticEq(endExpr, currExpr))
                            return true;
                        return "Exists-x-Elim: assumption ending step does not match current step.";
                    }
                    return "Exists-x-Elim: assumption beginning step doesn't match ref step for " + scopeVars[0] + ".";
                })
            },
            "=": {
                Name: "Equality",
                Type: "normal",
                IntroVerifier: new Justifier({ StepRefs: null }, function (proof, step, part, steps) {
                    var s = proof.steps[step].getSentence();
                    if (s[0] !== '=')
                        return "Equality-Intro: Current step is not an equality." + proof.steps[step].getSentence();
                    if (this.semanticEq(s[1], s[2]))
                        return true;
                    return "Equality-Intro: Left and right sides do not match.";
                }),
                ElimVerifier: new Justifier({ StepRefs: ["num", "num"] }, function (proof, step, part, steps) {
                    var equalityExpr = proof.steps[steps[0]].getSentence();
                    var elimExpr = proof.steps[steps[1]].getSentence();
                    var proposedResult = proof.steps[step].getSentence();
                    if (equalityExpr[0] !== '=')
                        return "Equality-Elim: First referenced step is not an equality.";
                    if (!this.semanticEq(elimExpr, proposedResult, equalityExpr[1], equalityExpr[2]))
                        return "Equality-Elim: Does not result in current step.";
                    return true;
                })
            },
        };
    }
    FOLRulebookFactory.prototype.BuildRulebook = function () {
        return this.rules;
    };
    FOLRulebookFactory.prototype.substitute = function (startExpr, a, b, bound) {
        this.debug("substitute", startExpr, a, b);
        bound = bound ? bound : [];
        var binOps = ["->", "and", "or", "<->", "="];
        var unOps = ["not", "forall", "exists"];
        while (startExpr[0] === 'paren')
            startExpr = startExpr[1];
        if (this.arrayContains(binOps, startExpr[0])) {
            var leftSide = this.substitute(startExpr[1], a, b);
            var rightSide = this.substitute(startExpr[2], a, b);
            return [startExpr[0], leftSide, rightSide];
        }
        else if (this.arrayContains(unOps, startExpr[0])) {
            if (startExpr[0] === "forall" || startExpr[0] === "exists") {
                bound = bound.slice(0);
                bound.push(startExpr[1]);
                return [startExpr[0], startExpr[1],
                    this.substitute(startExpr[2], a, b, bound)];
            }
            return [startExpr[0], this.substitute(startExpr[1], a, b, bound)];
        }
        else if (startExpr[0] === 'id') {
            if (startExpr.length === 2) {
                if (!this.arrayContains(bound, startExpr[1])) {
                    if (startExpr[1] === a)
                        return [startExpr[0], b];
                }
                return startExpr;
            }
            if (startExpr.length === 3) {
                var newTerms = [];
                for (var i = 0; i < startExpr[2].length; i++) {
                    newTerms.push(this.substitute(startExpr[2][i], a, b, bound));
                }
                return [startExpr[0], startExpr[1], newTerms];
            }
            throw Error("Unexpected AST format.");
        }
    };
    FOLRulebookFactory.prototype.semanticEq = function (A, B, suba, subb) {
        this.debug("semanticEq", A, B);
        var bound = {}, sub;
        if (suba) {
            sub = true;
            return _rec(A, B, {});
        }
        else {
            sub = false;
            return _rec(A, B);
        }
        function _rec(a, b, bound) {
            var binOps = ["->", "and", "or", "<->", "="];
            var unOps = ["not"];
            if (sub && this.semanticEq(a, suba)) {
                if ((a[0] !== 'id' || !bound[a[1]]) && _rec(subb, b, bound))
                    return true;
            }
            if (this.arrayContains(binOps, a[0]) && a[0] === b[0]) {
                if (_rec(a[1], b[1], bound) && _rec(a[2], b[2], bound)) {
                    return true;
                }
                return false;
            }
            else if (this.arrayContains(unOps, a[0]) && a[0] === b[0]) {
                if (_rec(a[1], b[1], bound)) {
                    return true;
                }
                return false;
            }
            else if (a[0] === 'exists' || a[0] === 'forall' && a[0] === b[0]) {
                var newb;
                if (sub) {
                    newb = this.clone(bound);
                    newb[a[1]] = true;
                }
                if (_rec(a[2], b[2], newb)) {
                    return true;
                }
                return false;
            }
            else if (a[0] === "id") {
                if (b && a[1] !== b[1])
                    return false;
                if (a.length == 2 && b.length == 2) {
                    return true;
                }
                if (a.length == 3 && b.length == 3) {
                    if (a[2].length != b[2].length) {
                        return false;
                    }
                    for (var i = 0; i < a[2].length; i++) {
                        if (!_rec(a[2][i], b[2][i], bound)) {
                            return false;
                        }
                    }
                    return true;
                }
            }
            return false;
        }
    };
    FOLRulebookFactory.prototype.isContradiction = function (s) {
        return (s[0] === 'id' && (s[1] === '_|_' || s[1] === 'contradiction'));
    };
    FOLRulebookFactory.prototype.arrayContains = function (arr, el) {
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] === el)
                return true;
        }
        return false;
    };
    FOLRulebookFactory.prototype.clone = function (obj) {
        var newo = {};
        for (var k in Object.keys(obj)) {
            newo[k] = obj[k];
        }
        return newo;
    };
    return FOLRulebookFactory;
})();
//# sourceMappingURL=FOLRulebookFactory.js.map