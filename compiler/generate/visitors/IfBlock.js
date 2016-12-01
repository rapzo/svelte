import deindent from '../utils/deindent.js';
import counter from '../utils/counter.js';

// collect all the conditions and blocks in the if/elseif/else chain
function generateBlock ( generator, node, name ) {
	// walk the children here
	generator.push({
		useAnchor: true,
		name,
		target: 'target',
		localElementDepth: 0,

		initStatements: [],
		updateStatements: [],
		teardownStatements: [],

		counter: counter()
	});
	node.children.forEach( generator.visit );
	//generator.visit( node.children );
	generator.addRenderer( generator.current );
	generator.pop();
	// unset the children, to avoid them being visited again
	node.children = [];
}
function getConditionsAndBlocks ( generator, node, _name, i = 0 ) {
	generator.addSourcemapLocations( node.expression );
	const name = `${_name}_${i}`;

	const conditionsAndBlocks = [{
		condition: generator.contextualise( node.expression ).snippet,
		block: name
	}];
	generateBlock( generator, node, name );

	if ( node.else && node.else.children.length === 1 &&
		node.else.children[0].type === 'IfBlock' ) {
		conditionsAndBlocks.push(
			...getConditionsAndBlocks( generator, node.else.children[0], _name, i + 1 ) );
	} else {
		const name = `${_name}_${i + 1}`;
		conditionsAndBlocks.push({
			condition: null,
			block: node.else ? name : null,
		});
		if (node.else) {
			generateBlock( generator, node.else, name );
		}
	}
	return conditionsAndBlocks;
}

export default {
	enter ( generator, node ) {
		const i = generator.counters.if++;

		const { params, target } = generator.current;
		const name = `ifBlock_${i}`;
		const getBlock = `getBlock_${i}`;
		const currentBlock = `currentBlock_${i}`;

		const conditionsAndBlocks = getConditionsAndBlocks( generator, node, `IfBlock_${i}` );

		generator.current.initStatements.push( deindent`
			var ${name}_anchor = document.createComment( ${JSON.stringify( `#if ${generator.source.slice( node.expression.start, node.expression.end )}` )} );
			${generator.appendToTarget( `${name}_anchor` )};

			function ${getBlock} ( ${params} ) {
				${conditionsAndBlocks.map( ({ condition, block }) => {
					return `${condition ? `if ( ${condition} ) ` : ''}return ${block};`;
				} ).join( '\n' )}
			}

			var ${currentBlock} = ${getBlock}( ${params} );
			var ${name} = ${currentBlock} && ${currentBlock}.render( ${params}, component, ${target}, ${name}_anchor );
		` );

		generator.current.updateStatements.push( deindent`
			var _${currentBlock} = ${currentBlock};
			${currentBlock} = ${getBlock}( ${params} );
			if ( _${currentBlock} === ${currentBlock} && ${name}) {
				${currentBlock}.update( ${name}, changed, ${params} );
			} else {
				if ( ${name} ) ${name}.teardown( true );
				${name} = ${currentBlock} && ${currentBlock}.render( ${params}, component, ${target}, ${name}_anchor );
			}
		` );

		const teardownStatements = [
			`if ( ${name} ) ${currentBlock}.teardown( ${name}, detach );`
		];

		if ( generator.current.localElementDepth === 0 ) {
			teardownStatements.push( `if ( detach ) ${name}_anchor.parentNode.removeChild( ${name}_anchor );` );
		}

		generator.current.teardownStatements.push( teardownStatements.join( '\n' ) );
	}
};
