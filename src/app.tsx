import React, { useState } from 'react';
import {Text, Box} from 'ink';
import InputBox from './inputBox.js';

// type Props = {
// 	name: string | undefined;
// };

export default function App() {
	const [query, setQuery] = useState('');
	const handleSubmit = () => {
		console.log(query);
	};
	return (
		<>
		<Box>
		<Text>
			Hello, Welcome to <Text color="green">aman-code</Text>
		</Text>
		</Box>
		<InputBox value={query} onChange={setQuery} placeholder='Type here' onSubmit={handleSubmit}/>
		</>
	);
}
