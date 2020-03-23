import React from 'react';
import PropTypes from 'prop-types';
import Form from "react-jsonschema-form";
import MyBaseInput from './Customisations/BaseInput.js'
import { Spinner, AccountStorageQuery, AccountStorageMutation, Toast, Icon, Modal, HeadingText, BlockText} from 'nr1'
import ToolPanel from './Components/ToolPanel'

// https://docs.newrelic.com/docs/new-relic-programmable-platform-introduction

export default class Configurator extends React.Component {

    static propTypes = {
        schema: PropTypes.object.isRequired,
        data: PropTypes.any.isRequired,
        dataChangeHandler: PropTypes.func.isRequired
    }

    constructor(props) {
        super(props);
        this.state = { persistentData:null, configVisible: false}
        this.loadFromStorage = this.loadFromStorage.bind(this);
        this.saveToStorage = this.saveToStorage.bind(this);
        this.saveJSONdata = this.saveJSONdata.bind(this)
    }

     componentDidMount() {
       this.loadFromStorage();
     }


    saveToStorage(data) {
    /*
    We save one document with meta dat indicating how many other documents there are to load.
    The data is then saved to multiple documents of 60k size each
    */

        const chunkSize= 60000 //60k

        const splitSlice = function(str, len) {
            var ret = [ ];
            for (var offset = 0, strLen = str.length; offset < strLen; offset += len) {
              ret.push(str.slice(offset, len + offset));
            }
            return ret;
          }
        let dataStr=JSON.stringify(data)
        let dataChunks=splitSlice(JSON.stringify(dataStr),chunkSize)
        console.log(`Saving data in ${dataChunks.length} ${chunkSize/1000}k chunks`)
        let metaData={chunks:dataChunks.length, totalSize:dataStr.length}
        Toast.showToast({
            type: Toast.TYPE.NORMAL,
            title: 'Saving data',
            description: `Saving config data using x${dataChunks.length} ${chunkSize/1000}k storage documents`,
            sticky: false
        });


        let validDocs=[`${this.props.documentId}-metadata`]
        dataChunks.forEach((chunk,idx)=>{
            validDocs.push(`${this.props.documentId}-chunk-${idx}`)
        })

        AccountStorageMutation.mutate({
            accountId: this.props.accountId,
            actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
            collection: this.props.storageCollectionId,
            documentId: `${this.props.documentId}-metadata`,
            document: JSON.stringify(metaData)
        }).catch(error => {
          console.log(error);
        })

        dataChunks.forEach((chunk,idx)=>{
            AccountStorageMutation.mutate({
                accountId: this.props.accountId,
                actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
                collection: this.props.storageCollectionId,
                documentId: `${this.props.documentId}-chunk-${idx}`,
                document: JSON.stringify(chunk)
            }).catch(error => {
              console.log(error);
            })
        })
        this.setState({persistentData: data, dataLoaded: true})
        this.props.dataChangeHandler(data)

        //delete unused chunks, these might be left over from when the config was larger
        AccountStorageQuery.query({
            accountId: this.props.accountId,
            collection: this.props.storageCollectionId
        }).then(({ data }) => {
            data.forEach((doc)=>{
                if(!validDocs.includes(doc.id) && doc.id.includes(this.props.documentId)) {
                    console.log(`Deleting unnecessary local storage chunk document ${doc.id}`)
                    AccountStorageMutation.mutate({
                        accountId: this.props.accountId,
                        actionType: AccountStorageMutation.ACTION_TYPE.DELETE_DOCUMENT,
                        collection: this.props.storageCollectionId,
                        documentId: doc.id,
                    })
                }
            })
        })

    }

    loadFromStorage() {
        AccountStorageQuery.query({
            accountId: this.props.accountId,
            collection: this.props.storageCollectionId
        }).then(({ data }) => {
            let metaData=data.find((e) => e.id===`${this.props.documentId}-metadata`)
            if(metaData) {
                console.log(`Loading ${metaData.document.chunks} chunks`)
                let promises=[]
                let results=[]
                for(let i=0; i<metaData.document.chunks; i++ ){
                    promises[i]=AccountStorageQuery.query({
                        accountId: this.props.accountId,
                        collection: this.props.storageCollectionId,
                        documentId: `${this.props.documentId}-chunk-${i}`,
                    }).then(({data})=>{
                        results[i]=data
                    })
                }
                let that=this
                Promise.all(promises).then(function() {
                    let resultStr=""
                    results.forEach((result)=>{
                        resultStr+=result
                    })

                    let parsedString=JSON.parse(resultStr)
                    if(parsedString.length != metaData.document.totalSize) {
                        alert('Config data loaded but unexpected size, it might be corrupt')
                    }
                    that.setState({persistentData: JSON.parse(parsedString), dataLoaded: true})
                    that.props.dataChangeHandler(JSON.parse(parsedString))
                  });

            } else {
                Toast.showToast({
                    type: Toast.TYPE.CRITICAL,
                    title: 'No config data',
                    description: 'No previously saved config data was found, initialising with empty config.',
                    sticky: false
                });
                this.setState({persistentData: {}, dataLoaded: true})
            }

        });

        // AccountStorageQuery.query({
        //     accountId: this.props.accountId,
        //     collection: this.props.storageCollectionId,
        //     documentId: this.props.documentId,
        // }).then(({ data }) => {
        //   console.log("Config data loaded",data)
        //   this.setState({persistentData: data, dataLoaded: true})
        // });
    }


    saveJSONdata(data) {
        try {
            let parsedData=JSON.parse(data)
            console.log(parsedData);
            this.saveToStorage(parsedData)
            Toast.showToast({
                type: Toast.TYPE.NORMAL,
                title: 'Success',
                description: 'The data was successfully imported.',
                sticky: false
            });
        } catch(e) {
            console.error(e)

           Toast.showToast({
                    type: Toast.TYPE.CRITICAL,
                    title: 'Data Error',
                    description: 'The data provided doesnt parse as valid JSON. Rectifiy and try again.',
                    sticky: true
                });
        }
    }

    render() {

        const { schema, dataChangeHandler, documentId, storageCollectionId, buttonTitle, modalTitle, modalHelp, uiSchema } = this.props
        const { persistentData,dataLoaded, configVisible } = this.state

        const log = (type) => console.log.bind(console, type)

        const btnStyle = {
          backgroundColor: "	#383838",
        }

        let returnVal
        if(configVisible) {
            returnVal=<div><Spinner inline />Loading configuration...</div>
            if(dataLoaded) {

                const widgets = {
                    BaseInput: MyBaseInput //a hack to allow us to remove the nr styles on text inputs
                };

                const onSubmit = ({formData}, e) => {
                    //console.log("Data submitted: ",  formData, JSON.stringify(formData))
                    dataChangeHandler(formData)
                    this.saveToStorage(formData)
                }

                const onChange = ({formData}, e) => {
                    this.setState({persistentData: formData})
                }

                let form = <Form schema={schema}
                        uiSchema={uiSchema}
                        widgets={widgets}
                        formData={persistentData}
                        onChange={onChange}
                        onSubmit={onSubmit}
                        onError={log("errors")}
                        >
                        <button className="u-unstyledButton btn btn-info" type="submit"><Icon spacingType={[Icon.SPACING_TYPE.SMALL]} type={Icon.TYPE.HARDWARE_AND_SOFTWARE__SOFTWARE__UPSTREAM_CONNECTION} inline />Save</button></Form>

                returnVal=<>
                    <div className="ConfiguratorForm">{form}</div>
                    <ToolPanel previousData="test" currentData={persistentData} saveHandler={this.saveJSONdata} documentId={documentId} storageCollectionId={storageCollectionId}/>

                </>
            }

        }

         return <div>
            <button style={btnStyle} className="btn btn-primary u-unstyledButton" onClick={()=>{this.setState({configVisible: !configVisible})}}>
                <Icon spacingType={[Icon.SPACING_TYPE.SMALL]} type={Icon.TYPE.INTERFACE__OPERATIONS__CONFIGURE} inline ></Icon> {buttonTitle ? buttonTitle : ""}
            </button>
            <Modal hidden={!configVisible} onClose={()=>{this.setState({configVisible: false})}} >
    <HeadingText>{modalTitle ? modalTitle : "Configuration Editor"}</HeadingText>
    <BlockText>{modalHelp ? modalHelp : "Use the form below to configure the application."}</BlockText>
               <div style={{"marginTop":"2em"}}>{returnVal}</div>
             </Modal>
        </div>
    }
}
